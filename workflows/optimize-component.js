export const meta = {
  name: 'optimize-component',
  description:
    'Audits skills, subagents, and workflows in this plugin against the guides in documentation/, verifies every finding adversarially, and rewrites each file in place. Use after drafting or changing a component and before committing it. Not for code outside the plugin, and not a substitute for bun run lint, which checks the mechanical rules.',
  whenToUse: 'After drafting or changing a skill, subagent, or workflow in this plugin. Run it on a clean tree, because it edits files in place.',
  phases: [
    { title: 'Audit', detail: 'one fresh-context auditor per component, findings with rubric identifiers and quoted evidence' },
    { title: 'Verify', detail: 'one skeptic per component tries to refute each finding' },
    { title: 'Rewrite', detail: 'apply the findings that survived, in place' },
  ],
};

// Inputs:
//   args.paths    Component files, relative to the plugin root: src/skills/<name>/SKILL.md,
//                 agents/<name>.md, or workflows/<name>.js.
//   args.rubrics  Optional extra rubric files the auditor reads, such as the vault rubrics.
//   args.apply    Set to false to audit and verify without rewriting anything.
//   args.models   Model overrides for the verify and rewrite stages: { verify, rewrite }. Both default
//                 to sonnet, because checking quotes against a file and applying small edits don't need
//                 the strongest model. The audit is the judgment step and always runs on the session model.

const paths = Array.isArray(args?.paths) ? args.paths.filter((path) => typeof path === 'string') : [];
const rubrics = Array.isArray(args?.rubrics) ? args.rubrics.filter((path) => typeof path === 'string') : [];
const apply = args?.apply !== false;
const models = { verify: 'sonnet', rewrite: 'sonnet', ...(typeof args?.models === 'object' && args.models !== null ? args.models : {}) };

if (paths.length === 0) {
  return { status: 'no input', message: 'Pass args.paths: a list of SKILL.md, agents/*.md, or workflows/*.js files.' };
}

const GUIDES = {
  skill: 'documentation/skills.md',
  subagent: 'documentation/subagents.md',
  workflow: 'documentation/workflows.md',
};

function kindOf(path) {
  if (/(^|\/)src\/skills\/[^/]+\/SKILL\.md$/.test(path)) return 'skill';
  if (/(^|\/)agents\/[^/]+\.md$/.test(path)) return 'subagent';
  if (/(^|\/)workflows\/[^/]+\.js$/.test(path)) return 'workflow';
  return null;
}

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['summary', 'findings'],
  properties: {
    summary: { type: 'string', description: 'Two or three sentences on what the component does well and where it falls short.' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['rule', 'severity', 'evidence', 'problem', 'repair'],
        properties: {
          rule: { type: 'string', description: 'The identifier from the guide, such as ACTIVATION-3 or PROCEDURE-C1.' },
          severity: { type: 'string', enum: ['must-fix', 'should-fix', 'nit'] },
          evidence: { type: 'string', description: 'A verbatim quote from the file. For something missing, quote the frontmatter or heading where it should be.' },
          problem: { type: 'string' },
          repair: { type: 'string', description: 'The smallest change that resolves it.' },
        },
      },
    },
  },
};

const VERDICTS_SCHEMA = {
  type: 'object',
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['index', 'refuted', 'reason'],
        properties: {
          index: { type: 'integer' },
          refuted: { type: 'boolean' },
          reason: { type: 'string' },
        },
      },
    },
  },
};

const REWRITE_SCHEMA = {
  type: 'object',
  required: ['status', 'applied', 'skipped'],
  properties: {
    status: { type: 'string', enum: ['rewritten', 'unchanged', 'blocked'] },
    applied: { type: 'array', items: { type: 'string' }, description: 'Rule identifiers that were applied.' },
    skipped: {
      type: 'array',
      items: { type: 'object', required: ['rule', 'reason'], properties: { rule: { type: 'string' }, reason: { type: 'string' } } },
    },
    notes: { type: 'string' },
  },
};

function auditPrompt(path, kind) {
  const extra = rubrics.length > 0 ? `\nAlso read these rubric files and cite their identifiers where they apply:\n${rubrics.map((r) => `- ${r}`).join('\n')}\n` : '';
  const skillNote =
    kind === 'skill'
      ? `\nList every file in the skill's directory. Each shipped file must be referenced from SKILL.md with a condition for loading it, and each reference must point at a file that exists. Scripts are referenced through \${CLAUDE_SKILL_DIR}/scripts/<name>.mjs and built from scripts/<name>.ts.\n`
      : '';

  return `You are auditing one ${kind} in a Claude Code plugin against its authoring guides. Read-only: do not edit anything.

1. Read documentation/authoring.md and ${GUIDES[kind]}. They define the rules and the identifiers (such as ACTIVATION-3, PROCEDURE-C1, PERMISSION-C1, GATE-3).${extra}
2. Read the component at ${path}.${skillNote}
3. Report every place the component falls short of a rule in the guides.

Rules for findings:
- Every finding cites the rule's identifier and quotes the file verbatim as evidence. For something absent, quote the frontmatter block or heading where it belongs. No quote, no finding.
- Severity: must-fix for a rule the guide states as a requirement or a safety or authority problem; should-fix for judgment the guide calls for and the file lacks; nit for wording.
- The repair is the smallest change that resolves the finding, not a rewrite.
- No quota. If the component meets the guides, return an empty findings list and say so in the summary.
- Judge fitness for the declared job. Don't demand scripts, references, or subagents where they add nothing.`;
}

function verifyPrompt(path, kind, findings) {
  const list = findings.map((f, i) => `${i}. [${f.severity}] ${f.rule}: ${f.problem}\n   evidence: ${JSON.stringify(f.evidence)}\n   repair: ${f.repair}`).join('\n');
  return `You are a skeptic checking an audit of the ${kind} at ${path}. Read-only.

Read documentation/authoring.md, ${GUIDES[kind]}, and the file at ${path}. Then try to refute each finding below. A finding is refuted when any of these holds:
- The quoted evidence does not appear in the file.
- The guide does not say what the finding claims, or the identifier doesn't match the rule.
- The file already satisfies the rule elsewhere.
- The repair would make the component worse: longer without changing a decision, broader tool access, an invented command, path, or tool name, or a contradiction with another rule.

Return a verdict for every index. Default to refuted when you can't confirm the finding from the file and the guides.

Findings:
${list}`;
}

function rewritePrompt(path, kind, findings) {
  const list = findings.map((f) => `- ${f.rule} (${f.severity}): ${f.problem}\n  evidence: ${JSON.stringify(f.evidence)}\n  repair: ${f.repair}`).join('\n');
  return `You are revising the ${kind} at ${path} in a Claude Code plugin. Read documentation/authoring.md and ${GUIDES[kind]} first, then the file, then apply these findings by editing the file in place:

${list}

Rules:
- Apply each finding with the smallest edit that resolves it. Don't restructure or lengthen the file beyond what the findings require.
- If the file already satisfies a finding, report it as applied without editing.
- Never invent a command, path, tool name, script, or option that isn't already in the file or named in the guides. If a repair needs one, skip that finding and say why.
- Keep the frontmatter valid YAML, keep name and description, and keep the description in the third person, at most 1,024 characters.
- ${kind === 'skill' ? "Edit only files that already exist inside the skill's directory (SKILL.md, references/, assets/, scripts/)." : 'Edit only the file named above.'} Never add, delete, move, or rename files; if a finding needs that, skip it and say so.
- For a workflow, keep export const meta a pure literal and the first statement, and don't introduce Date.now(), Math.random(), argless new Date(), or import().
- Don't run bun run lint or bun run build; the caller does that.
- If applying the findings would be unsafe or contradictory, make no edit and return status "blocked" with the reason.

Report which rule identifiers you applied and which you skipped, with reasons.`;
}

const components = paths.map((path) => ({ path, kind: kindOf(path) }));
const unsupported = components.filter((c) => c.kind === null).map((c) => c.path);
const supported = components.filter((c) => c.kind !== null);

if (supported.length === 0) return { status: 'no input', unsupported, message: 'None of the paths is a component.' };

if (unsupported.length > 0) log(`Skipping ${unsupported.length} path(s) that aren't components: ${unsupported.join(', ')}`);
log(`Auditing ${supported.length} component(s)${apply ? '' : ' (audit only, no rewrites)'}`);

const results = await pipeline(
  supported,
  // Audit
  // No agentType anywhere in this workflow: it is the plugin's own development tool and has to run in a
  // session where the plugin isn't installed, so repertoire:* agents can't be assumed to resolve.
  ({ path, kind }) => agent(auditPrompt(path, kind), { label: `audit ${path}`, phase: 'Audit', schema: FINDINGS_SCHEMA }),
  // Verify
  async (audit, { path, kind }) => {
    if (!audit) return { stage: 'audit', failed: true };
    const findings = audit.findings;
    if (findings.length === 0) return { audit, findings: [], refuted: [], unverified: [] };

    const verdicts = await agent(verifyPrompt(path, kind, findings), {
      label: `verify ${path}`,
      phase: 'Verify',
      schema: VERDICTS_SCHEMA,
      model: models.verify,
    });
    if (!verdicts) return { stage: 'verify', failed: true, audit, unverified: findings };

    const judgedIndexes = new Set(verdicts.verdicts.map((v) => v.index));
    const refutedIndexes = new Set(verdicts.verdicts.filter((v) => v.refuted).map((v) => v.index));
    const indexed = findings.map((finding, index) => ({ finding, index }));
    const refuted = indexed
      .filter(({ index }) => refutedIndexes.has(index))
      .map(({ finding, index }) => ({ ...finding, reason: verdicts.verdicts.find((v) => v.index === index)?.reason }));
    const unverified = indexed.filter(({ index }) => !judgedIndexes.has(index)).map(({ finding }) => finding);
    const surviving = indexed.filter(({ index }) => judgedIndexes.has(index) && !refutedIndexes.has(index)).map(({ finding }) => finding);
    return { audit, findings: surviving, refuted, unverified };
  },
  // Rewrite
  async (state, { path, kind }) => {
    if (state.failed) return { path, kind, status: `failed at ${state.stage}`, summary: state.audit?.summary, unverified: state.unverified ?? [] };
    const base = { path, kind, summary: state.audit.summary, findings: state.findings.length, refuted: state.refuted.length, unverified: state.unverified };
    if (state.findings.length === 0 && state.unverified.length > 0) return { ...base, status: 'unverified', applied: [], skipped: [] };
    if (state.findings.length === 0) return { ...base, status: 'clean', applied: [], skipped: [] };
    if (!apply) return { ...base, status: 'audited', proposed: state.findings, applied: [], skipped: [] };

    const rewrite = await agent(rewritePrompt(path, kind, state.findings), { label: `rewrite ${path}`, phase: 'Rewrite', schema: REWRITE_SCHEMA, model: models.rewrite });
    if (!rewrite) return { ...base, status: 'failed at rewrite' };
    return { ...base, status: rewrite.status, applied: rewrite.applied, skipped: rewrite.skipped, notes: rewrite.notes };
  },
);

const report = results.filter(Boolean);
const dropped = results.length - report.length;
if (dropped > 0) log(`${dropped} component(s) produced no result and are not in the report`);

const count = (status) => report.filter((r) => r.status === status).length;
return {
  status: apply ? 'done' : 'audited',
  totals: {
    components: supported.length,
    clean: count('clean'),
    rewritten: count('rewritten'),
    unchanged: count('unchanged'),
    blocked: count('blocked'),
    failed: report.filter((r) => r.status.startsWith('failed')).length + dropped,
    findings: report.reduce((n, r) => n + (r.findings ?? 0), 0),
    refuted: report.reduce((n, r) => n + (r.refuted ?? 0), 0),
    unverified: report.reduce((n, r) => n + (r.unverified?.length ?? 0), 0),
  },
  components: report,
  unsupported,
  next: apply ? 'Run bun run lint, then bun run build, and read the diff against the snapshot before committing.' : 'Re-run with apply: true to rewrite.',
};
