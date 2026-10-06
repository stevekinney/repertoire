/**
 * Lints skill sources (`src/skills/<skill>/`), subagents (`agents/*.md`), and workflows
 * (`workflows/*.js`).
 *
 * Every rule is deterministic: the same files always produce the same findings, in the same
 * order. Any finding fails the lint; there are no warnings. Each finding carries the rubric
 * checklist identifier it enforces (see `documentation/`), or `skillset` for findings that come
 * from `@lostgradient/skillset`'s validators.
 *
 * Usage:
 *   bun scripts/lint.ts
 */

import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import {
  checkClaudeWorkflowPhases,
  claudeWorkflowAgentOptionsSchema,
  claudeWorkflowMaximumScriptBytes,
  claudeWorkflowMetaSchema,
  extractClaudeWorkflowCalls,
  findClaudeWorkflowForbiddenApis,
  parseClaudeWorkflowMeta,
  validateSkillMetadata,
  validateSubagentMetadata,
  type ClaudeWorkflowCalls,
  type ClaudeWorkflowMeta,
  type Issue,
} from '@lostgradient/skillset';

import { ignoredFileNames, walk } from './lib/files';

export type Finding = {
  /** Repository-relative path of the file the finding is about. */
  path: string;
  /** The rubric checklist identifier this rule enforces, or `skillset`. */
  rule: string;
  message: string;
};

const maximumDescriptionLength = 1024;

/** Agent fields that Claude Code ignores in plugin-shipped subagents. */
const pluginIgnoredAgentFields: Record<string, string> = {
  hooks: 'ship hooks in `hooks/hooks.json` instead',
  mcpServers: 'ship MCP servers in `.mcp.json` instead',
  permissionMode: 'scope the agent with `tools` and `disallowedTools` instead',
};

/**
 * Every skillset issue fails the lint, warnings included. A new skillset release can add rules, so
 * the package is pinned to an exact version and upgraded deliberately.
 */
function skillsetFindings(issues: Issue[], path: string): Finding[] {
  return issues.map((issue) => ({ path, rule: 'skillset', message: issue.message }));
}

/**
 * Installing the plugin copies the repository as is, so a link that resolves here (or doesn't)
 * still breaks for everyone else. `lstatSync` reports the link itself, so dangling links count.
 */
function symbolicLinkFinding(file: string, root: string, replacement: string): Finding | undefined {
  if (!lstatSync(file).isSymbolicLink()) return undefined;
  return {
    path: relative(root, file),
    rule: 'RESOURCES-2',
    message: `is a symbolic link to \`${readlinkSync(file)}\`; replace it with ${replacement}, because the link won't resolve once the plugin is installed`,
  };
}

/** Where a source file ends up in the built skill, or `undefined` when it doesn't ship by itself. */
export function shippedPath(relativePath: string): string | undefined {
  const segments = relativePath.split(sep);
  const file = segments.at(-1)!;
  const extension = extname(file);

  if (ignoredFileNames.has(file)) return undefined;
  if (['.ts', '.mts', '.cts', '.tsx'].includes(extension)) {
    const isEntryPoint =
      segments.length === 2 &&
      segments[0] === 'scripts' &&
      (extension === '.ts' || extension === '.mts') &&
      !/\.(test|spec|d)\.m?ts$/.test(file);
    return isEntryPoint ? `scripts/${basename(file, extension)}.mjs` : undefined;
  }

  return segments.join('/');
}

function lintSkill(skillDirectory: string, root: string): Finding[] {
  const name = basename(skillDirectory);
  const skillFile = join(skillDirectory, 'SKILL.md');
  const path = relative(root, skillFile);

  if (!existsSync(skillFile)) {
    return [{ path: relative(root, skillDirectory), rule: 'ACTIVATION-1', message: 'skill directory has no SKILL.md' }];
  }

  const content = readFileSync(skillFile, 'utf8');
  const result = validateSkillMetadata(content, { target: 'claude', directoryName: name });
  const findings = skillsetFindings(result.issues, path);

  // Claude Code falls back to the folder name, so skillset accepts a missing `name`. Requiring it
  // keeps the skill's identity in the file, where it survives being copied or renamed.
  if (result.frontmatter && result.frontmatter.name === undefined) {
    findings.push({ path, rule: 'ACTIVATION-1', message: `frontmatter has no \`name\`; set \`name: ${name}\`` });
  }

  const files = walk(skillDirectory);

  for (const file of files) {
    const finding = symbolicLinkFinding(file, root, 'a real file');
    if (finding) findings.push(finding);
  }

  const shipped = new Set(
    files
      .map((file) => relative(skillDirectory, file))
      .filter((file) => file !== 'SKILL.md')
      .map(shippedPath)
      .filter((file): file is string => file !== undefined),
  );

  for (const match of content.matchAll(/\$\{CLAUDE_SKILL_DIR\}\/([^\s"'`)\]>]+)/g)) {
    const target = match[1]!;
    // A glob is a permission pattern, such as `Bash(cp ${CLAUDE_SKILL_DIR}/assets/* *)`, not a file reference.
    if (/[*?[]/.test(target)) continue;
    if (!shipped.has(target)) {
      const hint = target.endsWith('.mjs') ? ` (built from \`${target.replace(/\.mjs$/, '.ts')}\`)` : '';
      findings.push({ path, rule: 'RESOURCES-2', message: `references \`${target}\`${hint}, which the skill does not ship` });
    }
  }

  for (const match of content.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1]!.split('#')[0]!;
    if (target === '' || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/') || target.includes('${')) continue;
    if (!shipped.has(target.replace(/^\.\//, ''))) {
      findings.push({ path, rule: 'RESOURCES-2', message: `links to \`${target}\`, which the skill does not ship` });
    }
  }

  for (const match of content.matchAll(/(?<![\w}/.-])scripts\/[\w./-]+/g)) {
    findings.push({
      path,
      rule: 'RESOURCES-C1',
      message: `refers to \`${match[0]}\` without \`\${CLAUDE_SKILL_DIR}/\`, so it only works when the working directory is the skill folder`,
    });
  }

  for (const file of [...shipped].sort()) {
    if (!content.includes(file)) {
      findings.push({
        path,
        rule: 'RESOURCES-1',
        message: `the skill ships \`${file}\`, but SKILL.md never references it; reference it with a condition for loading it, or delete it`,
      });
    }
  }

  return findings;
}

/** Lint every skill in `sourceDirectory` (normally `src/skills/`). */
export function lintSkills(sourceDirectory: string, root: string): Finding[] {
  if (!existsSync(sourceDirectory)) return [];

  const entries = readdirSync(sourceDirectory, { withFileTypes: true });

  // A linked skill folder isn't a directory entry, so it would otherwise skip the lint entirely and
  // be copied into `skills/` as a link.
  const linkFindings = entries
    .map((entry) => symbolicLinkFinding(join(sourceDirectory, entry.name), root, 'the real skill folder'))
    .filter((finding): finding is Finding => finding !== undefined);

  return sort([
    ...linkFindings,
    ...entries.filter((entry) => entry.isDirectory()).flatMap((entry) => lintSkill(join(sourceDirectory, entry.name), root)),
  ]);
}

/** Lint every subagent in `agentsDirectory` (normally `agents/`). A missing directory has no agents. */
export function lintAgents(agentsDirectory: string, root: string): Finding[] {
  if (!existsSync(agentsDirectory)) return [];

  const findings: Finding[] = [];

  for (const entry of readdirSync(agentsDirectory).sort()) {
    const file = join(agentsDirectory, entry);
    const path = relative(root, file);

    if (ignoredFileNames.has(entry)) continue;
    if (statSync(file).isDirectory() || extname(entry) !== '.md') {
      findings.push({ path, rule: 'ACTIVATION-1', message: 'agents/ should contain only `<name>.md` files' });
      continue;
    }

    const result = validateSubagentMetadata(readFileSync(file, 'utf8'), { fileName: basename(entry, '.md') });
    findings.push(...skillsetFindings(result.issues, path));

    const frontmatter = result.frontmatter as Record<string, unknown> | undefined;
    if (!frontmatter) continue;

    if (frontmatter.tools === undefined) {
      findings.push({
        path,
        rule: 'PERMISSION-C1',
        message: 'has no `tools` allowlist, so it inherits every tool; list only the tools it needs',
      });
    }
    for (const [field, alternative] of Object.entries(pluginIgnoredAgentFields)) {
      if (frontmatter[field] !== undefined) {
        findings.push({ path, rule: 'PERMISSION-C1', message: `sets \`${field}\`, which Claude Code ignores in plugin subagents; ${alternative}` });
      }
    }
    if (typeof frontmatter.description === 'string' && frontmatter.description.length > maximumDescriptionLength) {
      findings.push({
        path,
        rule: 'ACTIVATION-1',
        message: `description is ${frontmatter.description.length} characters; keep it to ${maximumDescriptionLength} and move detail into the system prompt`,
      });
    }
  }

  return sort(findings);
}

const kebabCase = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The same first-person check skillset applies to skill descriptions. */
const firstPersonDescription = /^\s*(i|i'm|i'll|we|you|your)\b/i;

/** Keys Claude Code reads. Both schemas accept unknown keys, so a typo would otherwise do nothing. */
const knownMetaKeys = new Set(Object.keys(claudeWorkflowMetaSchema.shape));
const knownAgentOptionKeys = new Set(Object.keys(claudeWorkflowAgentOptionsSchema.shape));

type ParsedWorkflow = {
  path: string;
  fileName: string;
  meta?: ClaudeWorkflowMeta;
  calls?: Extract<ClaudeWorkflowCalls, { ok: true }>;
};

/** Run Claude Code's own load-time checks on one script, plus this plugin's rules for its `meta`. */
function lintWorkflowSource(source: string, workflow: ParsedWorkflow, findings: Finding[]): void {
  const { path, fileName } = workflow;
  const add = (rule: string, message: string, line?: number) =>
    findings.push({ path, rule, message: line === undefined ? message : `line ${line}: ${message}` });

  if (Buffer.byteLength(source) > claudeWorkflowMaximumScriptBytes) {
    add('skillset', `the script is larger than ${claudeWorkflowMaximumScriptBytes} bytes, which Claude Code refuses`);
  }

  const meta = parseClaudeWorkflowMeta(source);
  if (!meta.ok) {
    add('skillset', meta.error, meta.line);
  } else {
    workflow.meta = meta.meta;
    const { name, description } = meta.meta;

    if (!kebabCase.test(name)) add('ACTIVATION-1', `meta.name \`${name}\` must be kebab-case`);
    if (name !== fileName) add('ACTIVATION-1', `meta.name \`${name}\` must match its filename \`${fileName}.js\``);
    if (description.length > maximumDescriptionLength) {
      add('ACTIVATION-1', `meta.description is ${description.length} characters; keep it to ${maximumDescriptionLength}`);
    }
    if (firstPersonDescription.test(description)) {
      add('ACTIVATION-2', 'meta.description should be written in the third person ("Audits route handlers"), not as "I", "we", or "you"');
    }
    for (const key of Object.keys(meta.meta).filter((key) => !knownMetaKeys.has(key)).sort()) {
      add('ACTIVATION-1', `meta.${key} is not a key Claude Code reads; it is ignored`);
    }
  }

  const forbidden = findClaudeWorkflowForbiddenApis(source);
  if (forbidden.ok) {
    for (const usage of forbidden.usages) {
      add('skillset', `\`${usage.api}\` throws in a workflow script, because it would change what a resumed run does; pass values in through \`args\``, usage.line);
    }
  }

  const calls = extractClaudeWorkflowCalls(source);
  if (!calls.ok) {
    // A syntax error is reported once, here; the meta and forbidden-API checks fail on it too.
    if (meta.ok) add('skillset', calls.error, calls.line);
    return;
  }
  workflow.calls = calls;

  for (const agent of calls.agents) {
    const result = claudeWorkflowAgentOptionsSchema.safeParse(agent.options);
    if (!result.success) {
      for (const issue of result.error.issues) {
        add('skillset', `agent() option \`${issue.path.join('.')}\`: ${issue.message}`, agent.line);
      }
    }
    for (const key of Object.keys(agent.options).filter((key) => !knownAgentOptionKeys.has(key)).sort()) {
      add('ACTIVATION-1', `agent() option \`${key}\` is not one Claude Code reads; it is ignored`, agent.line);
    }
  }

  if (workflow.meta) {
    const listed = (workflow.meta.phases ?? []).map((phase) => phase.title);
    const phases = checkClaudeWorkflowPhases(calls.phases, listed);
    for (const use of phases.unlisted) {
      add('skillset', `phase \`${use.title}\` has no matching \`meta.phases\` entry; titles must match exactly`, use.line);
    }
    for (const title of phases.unused) {
      add('skillset', `meta.phases lists \`${title}\`, but no \`phase()\` call or agent \`phase\` option uses it`);
    }
  }
}

/**
 * Lint every workflow in `workflowsDirectory` (normally `workflows/`). References to this plugin's
 * subagents and workflows (`<pluginName>:<name>`) must resolve, because a missing one only fails
 * once the run reaches it.
 */
export function lintWorkflows(workflowsDirectory: string, agentsDirectory: string, root: string, pluginName: string): Finding[] {
  if (!existsSync(workflowsDirectory)) return [];

  const findings: Finding[] = [];
  const workflows: ParsedWorkflow[] = [];

  for (const entry of readdirSync(workflowsDirectory).sort()) {
    const file = join(workflowsDirectory, entry);
    const path = relative(root, file);

    if (ignoredFileNames.has(entry)) continue;

    const linkFinding = symbolicLinkFinding(file, root, 'the real file');
    if (linkFinding) {
      findings.push(linkFinding);
      continue;
    }
    if (statSync(file).isDirectory() || extname(entry) !== '.js') {
      findings.push({ path, rule: 'ACTIVATION-1', message: 'workflows/ should contain only `<name>.js` files' });
      continue;
    }

    const workflow: ParsedWorkflow = { path, fileName: basename(entry, '.js') };
    lintWorkflowSource(readFileSync(file, 'utf8'), workflow, findings);
    workflows.push(workflow);
  }

  const prefix = `${pluginName}:`;
  const byName = new Map(workflows.filter((workflow) => workflow.meta).map((workflow) => [workflow.meta!.name, workflow]));

  for (const workflow of workflows) {
    if (!workflow.calls) continue;
    const add = (rule: string, message: string, line: number) =>
      findings.push({ path: workflow.path, rule, message: `line ${line}: ${message}` });

    for (const agent of workflow.calls.agents) {
      const agentType = agent.options.agentType;
      if (typeof agentType !== 'string' || !agentType.startsWith(prefix)) continue;
      const agentName = agentType.slice(prefix.length);
      if (!existsSync(join(agentsDirectory, `${agentName}.md`))) {
        add('RESOURCES-2', `agentType \`${agentType}\` has no \`agents/${agentName}.md\` in this plugin`, agent.line);
      }
    }

    for (const call of workflow.calls.workflowReferences) {
      const { reference } = call;
      if (typeof reference === 'object' && reference !== null && 'scriptPath' in reference) {
        add('RESOURCES-2', `workflow() uses a \`scriptPath\`, which won't resolve once the plugin is installed; reference \`${prefix}<name>\` instead`, call.line);
        continue;
      }
      if (typeof reference !== 'string' || !reference.startsWith(prefix)) continue;

      const child = byName.get(reference.slice(prefix.length));
      if (!child) {
        add('RESOURCES-2', `workflow \`${reference}\` doesn't exist in this plugin`, call.line);
      } else if (child.calls && (child.calls.workflowReferences.length > 0 || child.calls.workflowReferencesUnresolved > 0)) {
        add('RESOURCES-2', `workflow \`${reference}\` calls workflow() itself, and workflows nest only one level deep`, call.line);
      }
    }
  }

  return sort(findings);
}

/** Plain code-unit comparison rather than `localeCompare`, so the order never depends on the locale. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sort(findings: Finding[]): Finding[] {
  return findings.sort((a, b) => compare(a.path, b.path) || compare(a.rule, b.rule) || compare(a.message, b.message));
}

export function formatFindings(findings: Finding[]): string {
  return findings.map((finding) => `${finding.path}: [${finding.rule}] ${finding.message}`).join('\n');
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, '..');
  const { name: pluginName } = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')) as { name: string };
  const findings = [
    ...lintSkills(join(root, 'src', 'skills'), root),
    ...lintAgents(join(root, 'agents'), root),
    ...lintWorkflows(join(root, 'workflows'), join(root, 'agents'), root, pluginName),
  ];

  if (findings.length > 0) {
    console.error(`${formatFindings(findings)}\n\nLint found ${findings.length} problem${findings.length === 1 ? '' : 's'}.`);
    process.exitCode = 1;
  } else {
    console.log('Lint passed.');
  }
}
