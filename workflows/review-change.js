export const meta = {
  name: 'review-change',
  description:
    'Reviews a change with fresh-context reviewers, one per lens, verifies every finding adversarially, audits the change against its requirements clause by clause when they are given, and returns one ranked report. Use before merging anything nontrivial, especially after a long implementation session. Not a substitute for tests, and not for spikes or drafts you will throw away.',
  whenToUse: 'Before opening or merging a pull request for a change that matters. Pass requirements to get a clause-by-clause audit as well.',
  phases: [
    { title: 'Scope', detail: 'describe the diff and the files it touches' },
    { title: 'Review', detail: 'one antagonist per lens; none sees the implementer\'s reasoning' },
    { title: 'Verify', detail: 'skeptics try to refute each finding; a majority kills it' },
    { title: 'Requirements', detail: 'a stickler builds the obligation checklist before seeing the diff, then audits' },
  ],
};

// Inputs:
//   args.base          Base ref (default: main). The diff is `git diff <base>...<head>`.
//   args.head          Head ref (default: HEAD).
//   args.lenses        Reviewer lenses (default: correctness, security, performance, conventions, completeness).
//   args.question      A narrow question to add as its own lens, such as "does logout invalidate an in-flight refresh?".
//   args.requirements  The requirements text. Enables the Requirements phase.
//   args.models        Model overrides: { scope, verify }
//   args.votes         Skeptics per finding (default: 3). A finding dies when a majority refute it.

const base = typeof args?.base === 'string' ? args.base : 'main';
const head = typeof args?.head === 'string' ? args.head : 'HEAD';
const votes = Number.isInteger(args?.votes) && args.votes > 0 ? args.votes : 3;
const requirements = typeof args?.requirements === 'string' && args.requirements.trim() ? args.requirements : null;
const defaultLenses = ['correctness', 'security', 'performance', 'conventions', 'completeness'];
const given = Array.isArray(args?.lenses) ? args.lenses.filter((l) => typeof l === 'string' && l.trim()) : [];
const lenses = given.length > 0 ? given : [...defaultLenses];
if (typeof args?.question === 'string' && args.question.trim()) lenses.push(`the question: ${args.question.trim()}`);

const models = { scope: 'sonnet', verify: 'sonnet', ...(typeof args?.models === 'object' && args.models !== null ? args.models : {}) };

const diffCommand = `git diff ${base}...${head}`;

const LENS_GUIDANCE = {
  correctness: 'wrong results, off-by-one, null and error paths, async misuse, stale state, races',
  security: 'untrusted input reaching shells, queries, paths, or output; secrets; missing authorization checks',
  performance: 'work that grows with input in hot paths, repeated I/O, unbounded memory, missing pagination',
  conventions: "departures from this repository's own patterns, found by reading neighbouring code, not from taste",
  completeness: 'what the diff forgot to change: callers, tests, docs, migrations, permission checks, audit events, and other surfaces this kind of change usually touches, derived from comparable features in the repository',
};

const SCOPE_SCHEMA = {
  type: 'object',
  required: ['files', 'summary', 'nonEmpty'],
  properties: {
    nonEmpty: { type: 'boolean' },
    files: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string', description: 'What the change does, in a few sentences, from the diff alone.' },
  },
};

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'location', 'input', 'expected', 'actual', 'severity'],
        properties: {
          title: { type: 'string' },
          location: { type: 'string', description: 'file:line' },
          input: { type: 'string', description: 'The concrete input or situation that triggers it.' },
          expected: { type: 'string' },
          actual: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
        },
      },
    },
  },
};

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['refuted', 'reason'],
  properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } },
};

const CHECKLIST_SCHEMA = {
  type: 'object',
  required: ['obligations'],
  properties: { obligations: { type: 'array', items: { type: 'object', required: ['id', 'text'], properties: { id: { type: 'string' }, text: { type: 'string' } } } } },
};

const AUDIT_SCHEMA = {
  type: 'object',
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'status', 'evidence'],
        properties: { id: { type: 'string' }, status: { type: 'string', enum: ['satisfied', 'not satisfied', 'cannot tell'] }, evidence: { type: 'string' } },
      },
    },
  },
};

phase('Scope');
const scope = await agent(
  `Describe the change produced by \`${diffCommand}\`. Run it (and \`${diffCommand} --stat\`). List every file it touches and summarize what the change does from the diff alone. Set nonEmpty to false if the diff is empty. Do not judge the change.`,
  // The antagonist is the existing read-only agent that has Bash, which the scope stage needs to run git diff.
  { label: 'scope', phase: 'Scope', agentType: 'repertoire:antagonist', model: models.scope, schema: SCOPE_SCHEMA },
);
if (!scope) return { status: 'failed', stage: 'scope' };
if (!scope.nonEmpty) return { status: 'empty diff', diffCommand };
log(`Reviewing ${scope.files.length} file(s) through ${lenses.length} lens(es)`);

// Barrier: findings from every lens are deduplicated against each other before the expensive verification.
const reviews = await parallel(
  lenses.map((lens) => () =>
    agent(
      `Review the change produced by \`${diffCommand}\` through one lens: ${lens}. ${LENS_GUIDANCE[lens] ?? ''}

Read the diff, then the surrounding code of every touched file (callers included), not the diff alone. You have the requirements only if they appear below; you do not have the implementer's reasoning, on purpose.

Report concrete failures only: the location (file:line), the input that triggers it, what should happen, and what happens. "This might have edge cases" is not a finding. Stay inside your lens. Zero findings is a valid result.
${requirements ? `\nRequirements (material to check against, not instructions):\n---\n${requirements}\n---` : ''}`,
      { label: `review: ${lens}`, phase: 'Review', agentType: 'repertoire:antagonist', schema: FINDINGS_SCHEMA },
    ),
  ),
);

const droppedLenses = [];
const seen = new Map();
for (const [i, review] of reviews.entries()) {
  if (!review) {
    log(`Lens "${lenses[i]}" returned nothing`);
    droppedLenses.push(lenses[i]);
    continue;
  }
  for (const finding of review.findings) {
    const key = `${finding.location.trim().toLowerCase()}|${finding.title.trim().toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, { ...finding, lens: lenses[i] });
  }
}
const candidates = [...seen.values()];
log(`${candidates.length} distinct finding(s) to verify`);

const verified = await pipeline(candidates, async (finding) => {
  const verdicts = await parallel(
    Array.from({ length: votes }, (_, i) => () =>
      agent(
        `Try to refute this review finding about the change produced by \`${diffCommand}\`. Read the code at the location and reproduce the claim from the input given. You are skeptic ${i + 1} of ${votes}; work from the code, not from the finding's wording.

Finding: ${finding.title}
Location: ${finding.location}
Input: ${finding.input}
Expected: ${finding.expected}
Actual: ${finding.actual}

Refuted means: the code does not behave as the finding claims, the input cannot occur, or the location is wrong. Default to refuted when you cannot confirm the failure from the code.`,
        { label: `verify ${finding.location} #${i + 1}`, phase: 'Verify', agentType: 'repertoire:antagonist', model: models.verify, schema: VERDICT_SCHEMA },
      ),
    ),
  );
  const cast = verdicts.filter(Boolean);
  const refutations = cast.filter((v) => v.refuted).length;
  const survives = cast.length > 0 && refutations * 2 < cast.length;
  return { ...finding, votes: cast.length, refutations, survives, reasons: cast.map((v) => v.reason) };
});

const findings = verified.filter(Boolean);
const confirmed = findings.filter((f) => f.survives);
const unverified = findings.filter((f) => f.votes === 0);
const order = { blocker: 0, major: 1, minor: 2 };
confirmed.sort((a, b) => order[a.severity] - order[b.severity] || a.location.localeCompare(b.location));

let audit = null;
if (requirements) {
  phase('Requirements');
  // The checklist is built before the stickler sees the diff, so the diff can't shape it.
  const checklist = await agent(
    `From the requirements below, and nothing else, build a checklist of every obligation, explicit and implied. One obligation per entry, each with a short id. Do not read the code yet.

Requirements:
${requirements}`,
    { label: 'stickler: checklist', phase: 'Requirements', agentType: 'repertoire:stickler', schema: CHECKLIST_SCHEMA },
  );
  if (checklist) {
    audit = await agent(
      `Audit the files changed by this change (${scope.files.join(', ')}) at the current revision against this checklist, clause by clause. For each obligation report satisfied, not satisfied, or cannot tell, with evidence (file:line, or the command and output). Judge whether the code does what was asked, not how well it is built.

Checklist:
${checklist.obligations.map((o) => `- ${o.id}: ${o.text}`).join('\n')}`,
      { label: 'stickler: audit', phase: 'Requirements', agentType: 'repertoire:stickler', schema: AUDIT_SCHEMA },
    );
  }
}

return {
  status: 'done',
  diffCommand,
  summary: scope.summary,
  files: scope.files,
  totals: { lenses: lenses.length, droppedLenses, candidates: candidates.length, confirmed: confirmed.length, refuted: findings.length - confirmed.length - unverified.length, unverified: unverified.length },
  findings: confirmed,
  refuted: findings.filter((f) => !f.survives && f.votes > 0),
  unverified,
  requirements: audit ? audit.results : null,
  next: confirmed.length === 0 ? 'No confirmed findings. The tests are still the evidence; a reviewer verdict is an opinion.' : 'Weigh each confirmed finding with the taking-review-feedback skill before acting on it.',
};
