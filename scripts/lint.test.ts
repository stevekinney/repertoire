import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { walk } from './lib/files';
import { lintAgents, lintSkills, lintWorkflows, shippedPath, type Finding } from './lint';

let root = '';

/** Write `files` (relative path → contents) into a fresh temporary root. */
function fixture(files: Record<string, string>): string {
  root = mkdtempSync(join(tmpdir(), 'repertoire-lint-'));
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  return root;
}

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = '';
});

const skills = (files: Record<string, string>) => lintSkills(join(fixture(files), 'src/skills'), root);
const agents = (files: Record<string, string>) => lintAgents(join(fixture(files), 'agents'), root);
const workflows = (files: Record<string, string>) =>
  lintWorkflows(join(fixture(files), 'workflows'), join(root, 'agents'), root, 'repertoire');
const rules = (findings: Finding[]) => findings.map((finding) => finding.rule);

const goodSkill = `---
name: format-diff
description: Formats a unified diff for review. Use when the user asks to tidy or summarize a diff. Not for writing commit messages.
---

Run \`node "\${CLAUDE_SKILL_DIR}/scripts/format.mjs" --input <file>\`.

Read [the style guide](references/style.md) only when the diff touches documentation.
`;

const goodAgent = `---
name: diff-reviewer
description: Reviews a diff for correctness bugs. Use after a feature is implemented and before opening a pull request.
tools: Read, Grep, Glob
model: sonnet
maxTurns: 20
---

You review diffs.
`;

describe('shippedPath', () => {
  test('maps top-level script sources to bundles', () => {
    expect(shippedPath('scripts/format.ts')).toBe('scripts/format.mjs');
    expect(shippedPath('scripts/format.mts')).toBe('scripts/format.mjs');
  });

  test('does not ship library code, tests, or ignored files', () => {
    expect(shippedPath('scripts/lib/parse.ts')).toBeUndefined();
    expect(shippedPath('scripts/format.test.ts')).toBeUndefined();
    expect(shippedPath('references/.DS_Store')).toBeUndefined();
  });

  test('ships everything else as is', () => {
    expect(shippedPath('references/style.md')).toBe('references/style.md');
  });
});

describe('lintSkills', () => {
  test('passes a well-formed skill, including its Claude-only features', () => {
    expect(
      skills({
        'src/skills/format-diff/SKILL.md': goodSkill,
        'src/skills/format-diff/scripts/format.ts': '',
        'src/skills/format-diff/scripts/lib/parse.ts': '',
        'src/skills/format-diff/scripts/format.test.ts': '',
        'src/skills/format-diff/references/style.md': '',
      }),
    ).toEqual([]);
  });

  test('passes when there are no skills', () => {
    expect(skills({ 'src/skills/.gitkeep': '' })).toEqual([]);
    expect(skills({})).toEqual([]);
  });

  test('reports a skill directory without SKILL.md', () => {
    expect(rules(skills({ 'src/skills/empty/notes.md': '' }))).toEqual(['ACTIVATION-1']);
  });

  test('reports skillset findings', () => {
    const findings = skills({
      'src/skills/other/SKILL.md': '---\nname: helper\ndescription: I help you with stuff.\n---\n',
    });
    const messages = findings.map((finding) => finding.message).join('\n');

    expect(new Set(rules(findings))).toEqual(new Set(['skillset']));
    expect(messages).toContain('must match its directory name');
    expect(messages).toContain('is vague');
    expect(messages).toContain('third person');
    expect(messages).toContain('body is empty');
  });

  test('reports a description over 1,024 characters', () => {
    const findings = skills({
      'src/skills/long/SKILL.md': `---\nname: long\ndescription: ${'Formats diffs. '.repeat(80)}\n---\nBody.\n`,
    });
    expect(findings.map((finding) => finding.message)).toContain('description exceeds 1024 characters');
  });

  test('reports a skill without an explicit name, even though Claude Code would use the folder name', () => {
    const findings = skills({
      'src/skills/tidy-diff/SKILL.md': '---\ndescription: Tidies a diff. Use when the user asks to tidy a diff.\n---\nBody.\n',
    });
    expect(findings).toEqual([
      expect.objectContaining({ rule: 'ACTIVATION-1', message: expect.stringContaining('set `name: tidy-diff`') }),
    ]);
  });

  test('reports a skill without a description', () => {
    const findings = skills({ 'src/skills/tidy-diff/SKILL.md': '---\nname: tidy-diff\n---\nBody.\n' });
    expect(findings).toEqual([
      expect.objectContaining({ rule: 'skillset', message: expect.stringContaining('description is missing') }),
    ]);
  });

  test('reports references to files the skill does not ship', () => {
    const findings = skills({
      'src/skills/format-diff/SKILL.md': goodSkill,
    });
    expect(findings).toEqual([
      expect.objectContaining({ rule: 'RESOURCES-2', message: expect.stringContaining('links to `references/style.md`') }),
      expect.objectContaining({ rule: 'RESOURCES-2', message: expect.stringContaining('built from `scripts/format.ts`') }),
    ]);
  });

  test('treats a glob under ${CLAUDE_SKILL_DIR} as a permission pattern, not a file reference', () => {
    const files = {
      'src/skills/scaffold/SKILL.md': `---
name: scaffold
description: Copies loop templates into a project. Use when asked to scaffold a loop.
allowed-tools: Bash(cp \${CLAUDE_SKILL_DIR}/assets/* *)
---

Copy [the loop script](assets/loop.sh) into the project.
`,
      'src/skills/scaffold/assets/loop.sh': '',
    };
    expect(skills(files)).toEqual([]);

    const broken = { ...files, 'src/skills/scaffold/SKILL.md': files['src/skills/scaffold/SKILL.md'] + 'Then run `node "${CLAUDE_SKILL_DIR}/scripts/missing.mjs"`.\n' };
    expect(rules(skills(broken))).toEqual(['RESOURCES-2']);
  });

  test('reports script paths that skip ${CLAUDE_SKILL_DIR}', () => {
    const findings = skills({
      'src/skills/run-it/SKILL.md': '---\nname: run-it\ndescription: Runs a script. Use when asked to run it.\n---\nRun `node scripts/run.mjs`.\n',
      'src/skills/run-it/scripts/run.ts': '',
    });
    expect(rules(findings)).toEqual(['RESOURCES-C1']);
  });

  test('reports shipped files that SKILL.md never references', () => {
    const findings = skills({
      'src/skills/format-diff/SKILL.md': goodSkill,
      'src/skills/format-diff/scripts/format.ts': '',
      'src/skills/format-diff/references/style.md': '',
      'src/skills/format-diff/references/unused.md': '',
    });
    expect(findings).toEqual([
      expect.objectContaining({ rule: 'RESOURCES-1', message: expect.stringContaining('`references/unused.md`') }),
    ]);
  });

  describe('symbolic links', () => {
    /** The well-formed skill, with `references/style.md` replaced by a link to `target`. */
    function linkedSkill(target: string, extraFiles: Record<string, string> = {}): Finding[] {
      fixture({
        'src/skills/format-diff/SKILL.md': goodSkill,
        'src/skills/format-diff/scripts/format.ts': '',
        ...extraFiles,
      });
      mkdirSync(join(root, 'src/skills/format-diff/references'), { recursive: true });
      symlinkSync(target, join(root, 'src/skills/format-diff/references/style.md'));
      return lintSkills(join(root, 'src/skills'), root);
    }

    test('reports a dangling symbolic link', () => {
      expect(linkedSkill('../../../../deleted/style.md')).toEqual([
        {
          path: join('src', 'skills', 'format-diff', 'references', 'style.md'),
          rule: 'RESOURCES-2',
          message: expect.stringContaining('is a symbolic link to `../../../../deleted/style.md`; replace it with a real file'),
        },
      ]);
    });

    test('reports a symbolic link that resolves', () => {
      const findings = linkedSkill('../../../../shared/style.md', { 'shared/style.md': '' });

      expect(existsSync(join(root, 'src/skills/format-diff/references/style.md'))).toBe(true);
      expect(findings).toEqual([
        {
          path: join('src', 'skills', 'format-diff', 'references', 'style.md'),
          rule: 'RESOURCES-2',
          message: expect.stringContaining('is a symbolic link to `../../../../shared/style.md`; replace it with a real file'),
        },
      ]);
    });

    test('reports a linked skill folder, whether or not it resolves', () => {
      fixture({
        'shared/format-diff/SKILL.md': goodSkill,
        'src/skills/.gitkeep': '',
      });
      symlinkSync('../../shared/format-diff', join(root, 'src/skills/format-diff'));
      symlinkSync('../../deleted/other-skill', join(root, 'src/skills/other-skill'));

      expect(lintSkills(join(root, 'src/skills'), root)).toEqual([
        {
          path: join('src', 'skills', 'format-diff'),
          rule: 'RESOURCES-2',
          message: expect.stringContaining('is a symbolic link to `../../shared/format-diff`; replace it with the real skill folder'),
        },
        {
          path: join('src', 'skills', 'other-skill'),
          rule: 'RESOURCES-2',
          message: expect.stringContaining('is a symbolic link to `../../deleted/other-skill`; replace it with the real skill folder'),
        },
      ]);
    });
  });
});

describe('walk', () => {
  test('lists symbolic links without following them, even when they dangle', () => {
    const directory = join(fixture({ 'real/file.md': '' }), 'real');
    symlinkSync('missing.md', join(directory, 'dangling.md'));
    symlinkSync('.', join(directory, 'loop'));

    expect(walk(directory).sort()).toEqual(['dangling.md', 'file.md', 'loop'].map((name) => join(directory, name)));
  });
});

describe('lintAgents', () => {
  test('passes a well-formed agent, including fields Codex would drop', () => {
    expect(agents({ 'agents/diff-reviewer.md': goodAgent })).toEqual([]);
  });

  test('passes when there is no agents directory', () => {
    expect(agents({})).toEqual([]);
  });

  test('reports an agent without a tools allowlist', () => {
    const findings = agents({ 'agents/diff-reviewer.md': goodAgent.replace('tools: Read, Grep, Glob\n', '') });
    expect(rules(findings)).toEqual(['PERMISSION-C1']);
  });

  test('reports fields that plugin subagents ignore', () => {
    const findings = agents({
      'agents/deployer.md': `---
name: deployer
description: Deploys the site. Use when the user asks to deploy.
tools: Bash
permissionMode: acceptEdits
mcpServers: [github]
hooks:
  PreToolUse:
    - matcher: Bash
      hooks: [{ type: command, command: ./check.sh }]
---

Deploy the site.
`,
    });
    const messages = findings.filter((finding) => finding.rule === 'PERMISSION-C1').map((finding) => finding.message);

    expect(messages).toHaveLength(3);
    expect(messages.join('\n')).toContain('`hooks/hooks.json`');
    expect(messages.join('\n')).toContain('`.mcp.json`');
    expect(messages.join('\n')).toContain('`permissionMode`');
  });

  test('reports skillset findings', () => {
    const findings = agents({ 'agents/reviewer.md': '---\nname: other\ndescription: Reviews.\ntools: Read\n---\n' });
    const messages = findings.map((finding) => finding.message).join('\n');

    expect(new Set(rules(findings))).toEqual(new Set(['skillset']));
    expect(messages).toContain('must match its filename');
    expect(messages).toContain('body is empty');
  });

  test('reports an agent without a description', () => {
    const findings = agents({ 'agents/reviewer.md': '---\nname: reviewer\ntools: Read\n---\n\nReview diffs.\n' });
    expect(findings).toEqual([expect.objectContaining({ rule: 'skillset', message: expect.stringContaining('description') })]);
  });

  test('reports a description over 1,024 characters', () => {
    const findings = agents({
      'agents/diff-reviewer.md': goodAgent.replace(/^description: .*$/m, `description: ${'Reviews diffs. '.repeat(80)}`),
    });
    expect(rules(findings)).toEqual(['ACTIVATION-1']);
  });

  test('reports files that are not agent definitions', () => {
    expect(rules(agents({ 'agents/notes.txt': '' }))).toEqual(['ACTIVATION-1']);
  });
});

describe('lintWorkflows', () => {
  /** Build a workflow script from a `meta` literal and a body. */
  const script = (meta: string, body = '') => `export const meta = ${meta};\n${body}`;

  const goodWorkflow = script(
    `{
  name: 'audit-routes',
  description: 'Audits route handlers for missing authentication checks. Use before a release.',
  whenToUse: 'Before a release.',
  phases: [{ title: 'Find' }, { title: 'Verify' }],
}`,
    `const files = args?.files ?? [];
if (files.length === 0) return { status: 'no input' };
phase('Find');
const found = await pipeline(files, (file) =>
  agent(\`Audit \${file}\`, { label: file, phase: 'Find', agentType: 'repertoire:route-auditor', schema: { type: 'object', properties: { issues: { type: 'array' } } } }),
);
const verified = await agent('Verify the findings.', { phase: 'Verify', effort: 'high' });
const summary = await workflow('repertoire:summarize', { verified });
phase(\`Batch \${files.length}\`);
return { found: found.filter(Boolean), summary };
`,
  );

  const goodFiles = {
    'workflows/audit-routes.js': goodWorkflow,
    'workflows/summarize.js': script(`{ name: 'summarize', description: 'Summarizes verified findings.' }`, "return await agent('Summarize.');\n"),
    'agents/route-auditor.md': '',
  };

  test('passes well-formed workflows, including a computed phase title it cannot check', () => {
    expect(workflows(goodFiles)).toEqual([]);
  });

  test('passes when there is no workflows directory', () => {
    expect(workflows({})).toEqual([]);
  });

  test('reports a meta block that is not a pure literal first statement', () => {
    const findings = workflows({
      'workflows/a.js': "const name = 'a';\nexport const meta = { name, description: 'Does a.' };\n",
      'workflows/b.js': "export const meta = { name: 'b', description: `Does ${1}.` };\n",
    });
    expect(findings).toEqual([
      expect.objectContaining({ path: 'workflows/a.js', rule: 'skillset', message: expect.stringContaining('FIRST statement') }),
      expect.objectContaining({ path: 'workflows/b.js', rule: 'skillset', message: expect.stringContaining('pure literal') }),
    ]);
  });

  test('reports calls that throw or fail in a workflow script', () => {
    const findings = workflows({
      'workflows/clock.js': script(
        "{ name: 'clock', description: 'Reads the clock.' }",
        "const a = Date.now();\nconst b = Math.random();\nconst c = new Date();\nconst d = await import('fs');\n",
      ),
    });
    const messages = findings.map((finding) => finding.message);

    expect(new Set(rules(findings))).toEqual(new Set(['skillset']));
    for (const api of ['Date.now', 'Math.random', 'new Date()', 'import()']) {
      expect(messages.some((message) => message.includes(`\`${api}\``))).toBe(true);
    }
  });

  test('reports a syntax error once, with its line', () => {
    const findings = workflows({ 'workflows/broken.js': script("{ name: 'broken', description: 'Breaks.' }", 'const x = ;\n') });
    expect(findings).toEqual([expect.objectContaining({ rule: 'skillset', message: expect.stringMatching(/^line 2: /) })]);
  });

  test('reports invalid and unknown agent() options', () => {
    const findings = workflows({
      'workflows/options.js': script(
        "{ name: 'options', description: 'Has bad options.' }",
        `await agent('a', { effort: 'extreme' });
await agent('b', { isolation: 'remote' });
await agent('c', { schema: { type: 'object', properties: {}, required: ['missing'], additionalProperties: false } });
await agent('d', { efort: 'low' });
`,
      ),
    });

    expect(findings.filter((finding) => finding.rule === 'skillset').map((finding) => finding.message)).toEqual([
      expect.stringMatching(/^line 2: agent\(\) option `effort`/),
      expect.stringMatching(/^line 3: agent\(\) option `isolation`/),
      expect.stringMatching(/^line 4: agent\(\) option `schema.required`/),
    ]);
    expect(findings.filter((finding) => finding.rule === 'ACTIVATION-1')).toEqual([
      expect.objectContaining({ message: expect.stringContaining('`efort` is not one Claude Code reads') }),
    ]);
  });

  test('reports phase titles that do not match meta.phases', () => {
    const findings = workflows({
      'workflows/phases.js': script(
        "{ name: 'phases', description: 'Has phases.', phases: [{ title: 'Find' }, { title: 'Verify' }] }",
        "phase('find');\nawait agent('a', { phase: 'Find' });\n",
      ),
    });
    expect(findings.map((finding) => finding.message)).toEqual([
      expect.stringContaining('phase `find` has no matching'),
      expect.stringContaining('meta.phases lists `Verify`'),
    ]);
  });

  test('reports problems with meta', () => {
    const findings = workflows({
      'workflows/audit.js': script(
        `{ name: 'Audit_Routes', description: 'I audit your routes. ${'Audits routes. '.repeat(70)}', descripton: 'typo' }`,
      ),
    });
    const messages = findings.map((finding) => finding.message).join('\n');

    expect(rules(findings).sort()).toEqual(['ACTIVATION-1', 'ACTIVATION-1', 'ACTIVATION-1', 'ACTIVATION-1', 'ACTIVATION-2']);
    expect(messages).toContain('must be kebab-case');
    expect(messages).toContain('must match its filename `audit.js`');
    expect(messages).toContain('characters; keep it to 1024');
    expect(messages).toContain('meta.descripton is not a key');
    expect(messages).toContain('third person');
  });

  test('reports references to subagents and workflows the plugin does not have', () => {
    const findings = workflows({
      'workflows/caller.js': script(
        "{ name: 'caller', description: 'Calls things.' }",
        `await agent('a', { agentType: 'repertoire:missing-agent' });
await agent('b', { agentType: 'general-purpose' });
await workflow('repertoire:missing-workflow');
await workflow({ scriptPath: './other.js' });
await workflow('repertoire:middle');
await workflow('someone-elses-workflow');
`,
      ),
      'workflows/middle.js': script("{ name: 'middle', description: 'Calls another workflow.' }", "await workflow('someone-elses-workflow');\n"),
    });

    expect(findings.map((finding) => finding.message)).toEqual([
      expect.stringMatching(/^line 2: agentType `repertoire:missing-agent` has no `agents\/missing-agent.md`/),
      expect.stringMatching(/^line 4: workflow `repertoire:missing-workflow` doesn't exist/),
      expect.stringMatching(/^line 5: workflow\(\) uses a `scriptPath`/),
      expect.stringMatching(/^line 6: workflow `repertoire:middle` calls workflow\(\) itself/),
    ]);
    expect(new Set(rules(findings))).toEqual(new Set(['RESOURCES-2']));
  });

  test('reports files that are not workflow scripts, and symbolic links', () => {
    fixture({ 'workflows/notes.md': '', 'shared/real.js': goodWorkflow });
    symlinkSync('../shared/real.js', join(root, 'workflows/linked.js'));

    const findings = lintWorkflows(join(root, 'workflows'), join(root, 'agents'), root, 'repertoire');
    expect(findings).toEqual([
      expect.objectContaining({ path: 'workflows/linked.js', rule: 'RESOURCES-2', message: expect.stringContaining('symbolic link') }),
      expect.objectContaining({ path: 'workflows/notes.md', rule: 'ACTIVATION-1' }),
    ]);
  });
});

test('findings are sorted and stable across runs', () => {
  const files = {
    'src/skills/b-skill/SKILL.md': '---\nname: helper\ndescription: I help.\n---\n',
    'src/skills/a-skill/SKILL.md': '---\nname: helper\ndescription: I help.\n---\n',
  };
  const first = skills(files);
  rmSync(root, { recursive: true, force: true });
  const second = skills(files);

  expect(first.map((finding) => finding.path.split('/')[2])).toEqual([
    ...Array(first.filter((finding) => finding.path.includes('a-skill')).length).fill('a-skill'),
    ...Array(first.filter((finding) => finding.path.includes('b-skill')).length).fill('b-skill'),
  ]);
  expect(second).toEqual(first);
});
