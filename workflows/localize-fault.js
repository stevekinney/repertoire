export const meta = {
  name: 'localize-fault',
  description:
    'Turns a bug report into a minimal failing test, then tests each plausible cause in parallel and ranks them with evidence, so the fix starts with proof of the bug and a short list of suspects. Use for bugs in code the agent has not seen or where the symptom is far from the cause. Not for a bug whose file and line are already known, or when a failing test already exists.',
  whenToUse: 'When a bug report, flaky CI run, or production error arrives and nobody knows where it lives yet.',
  phases: [
    { title: 'Reproduce', detail: 'a reenactor writes the smallest failing test and names the suspects' },
    { title: 'Investigate', detail: 'one conspiracy theorist per hypothesis, same reproduction' },
    { title: 'Judge', detail: 'rank the causes against fixed criteria' },
  ],
};

// Inputs:
//   args.report       The bug report, failing output, or error, verbatim.
//   args.command      How to run the relevant tests, if known.
//   args.scope        Paths to search first, if known.
//   args.maxHypotheses  Cap on hypotheses investigated in parallel (default: 4).

const report = typeof args?.report === 'string' ? args.report.trim() : '';
if (!report) return { status: 'no input', message: 'Pass args.report: the bug report or failing output.' };
const command = typeof args?.command === 'string' ? args.command : null;
const scope = Array.isArray(args?.scope) ? args.scope.filter((p) => typeof p === 'string') : [];
const maxHypotheses = Number.isInteger(args?.maxHypotheses) && args.maxHypotheses > 0 ? args.maxHypotheses : 4;

const REPRODUCTION_SCHEMA = {
  type: 'object',
  required: ['reproduced', 'attempts'],
  properties: {
    reproduced: { type: 'boolean' },
    attempts: { type: 'string', description: 'What was tried, whether or not it worked.' },
    testPath: { type: 'string' },
    command: { type: 'string', description: 'The command that runs the failing test.' },
    failure: { type: 'string', description: 'The failure output, trimmed to the relevant lines.' },
    suspects: { type: 'array', items: { type: 'object', required: ['location', 'reason'], properties: { location: { type: 'string' }, reason: { type: 'string' } } } },
    hypotheses: { type: 'array', items: { type: 'string' }, description: 'Distinct plausible causes, most likely first.' },
  },
};

const INVESTIGATION_SCHEMA = {
  type: 'object',
  required: ['hypothesis', 'verdict', 'evidence'],
  properties: {
    hypothesis: { type: 'string' },
    verdict: { type: 'string', enum: ['confirmed', 'ruled out', 'inconclusive'] },
    evidence: { type: 'string', description: 'What was run or read, with locations and output.' },
    pointsElsewhere: { type: 'string', description: 'Evidence that implicates a different cause, if any.' },
  },
};

const RANKING_SCHEMA = {
  type: 'object',
  required: ['ranking'],
  properties: {
    ranking: {
      type: 'array',
      items: {
        type: 'object',
        required: ['hypothesis', 'score', 'reason'],
        properties: {
          hypothesis: { type: 'string' },
          score: { type: 'integer' },
          reason: { type: 'string' },
          evidence: { type: 'string', description: 'The locators (file:line, command, output) the score rests on.' },
          unverified: { type: 'string', description: 'Evidence in the report that could not be checked, and why.' },
        },
      },
    },
  },
};

phase('Reproduce');
const reproduction = await agent(
  `Reproduce this bug as the smallest failing test that fails for the reported reason, not some other reason.${command ? ` The tests run with: ${command}.` : ''}${scope.length ? ` Start in: ${scope.join(', ')}.` : ''}

Write the test, run it, and confirm the failure matches the report. Then narrow the suspects: the files and lines the failure runs through, ranked by how likely each is at fault. List distinct plausible causes as hypotheses, most likely first. You may write tests; do not change application code. If you cannot make the failure happen, say so and report what you tried; that is a finding too.

Report:
${report}`,
  { label: 'reenactor', phase: 'Reproduce', agentType: 'repertoire:reenactor', schema: REPRODUCTION_SCHEMA },
);
if (!reproduction) return { status: 'failed', stage: 'reproduce' };
if (!reproduction.reproduced) return { status: 'not reproduced', attempts: reproduction.attempts, suspects: reproduction.suspects ?? [], next: 'Get more detail (versions, data, exact steps) before anyone writes a patch.' };
const missing = ['command', 'failure'].filter((key) => !reproduction[key]);
if (missing.length) return { status: 'reproduced, incomplete', missing, attempts: reproduction.attempts, test: { path: reproduction.testPath }, suspects: reproduction.suspects ?? [] };

const hypotheses = (reproduction.hypotheses ?? []).slice(0, maxHypotheses);
if ((reproduction.hypotheses ?? []).length > maxHypotheses) log(`Investigating ${maxHypotheses} of ${reproduction.hypotheses.length} hypotheses; the rest are returned uninvestigated`);
if (hypotheses.length === 0) {
  return { status: 'reproduced, no hypotheses', test: { path: reproduction.testPath, command: reproduction.command, failure: reproduction.failure }, suspects: reproduction.suspects ?? [] };
}
log(`Reproduced. Investigating ${hypotheses.length} hypothesis(es) in parallel`);

const investigations = await pipeline(hypotheses, (hypothesis, _, index) =>
  agent(
    `Test exactly one hypothesis about a reproduced bug. Confirm it or rule it out with evidence; do not investigate other causes, but report evidence that points elsewhere if you run into it. Do not fix anything.

Hypothesis ${index + 1}: ${hypothesis}
Reproduction: run \`${reproduction.command}\` (test at ${reproduction.testPath}). Current failure:
${reproduction.failure}
Suspects from the reproduction: ${(reproduction.suspects ?? []).map((s) => `${s.location} (${s.reason})`).join('; ') || 'none listed'}`,
    { label: `hypothesis ${index + 1}`, phase: 'Investigate', agentType: 'repertoire:conspiracy-theorist', schema: INVESTIGATION_SCHEMA },
  ),
);
const reports = investigations.filter(Boolean);
if (reports.length < investigations.length) log(`${investigations.length - reports.length} investigation(s) returned nothing`);
const failed = hypotheses.filter((_, i) => !investigations[i]);
const uninvestigated = (reproduction.hypotheses ?? []).slice(maxHypotheses);
const test = { path: reproduction.testPath, command: reproduction.command, failure: reproduction.failure };

if (reports.length < 2) {
  return {
    status: reports.length ? 'one explanation, not ranked' : 'no investigations completed',
    test,
    suspects: reproduction.suspects ?? [],
    investigations: reports,
    failed,
    uninvestigated,
  };
}

phase('Judge');
const ranking = await agent(
  `Rank these competing explanations of one reproduced bug. The criteria are fixed: (1) the explanation accounts for the exact failure in the reproduction, (2) its evidence is specific and could be re-run, (3) nothing in the other reports contradicts it. Score each 0-10 and give the reason. Do not merge explanations into a new one; rank what is here. Note any explanation whose evidence you could not check.

Reproduction: \`${reproduction.command}\` fails with:
${reproduction.failure}

Reports:
${reports.map((r, i) => `${i + 1}. ${r.hypothesis}\n   evidence: ${r.evidence}${r.pointsElsewhere ? `\n   points elsewhere: ${r.pointsElsewhere}` : ''}`).join('\n')}`,
  { label: 'judge', phase: 'Judge', agentType: 'repertoire:judge', schema: RANKING_SCHEMA },
);

return {
  status: ranking ? 'done' : 'investigated, not ranked',
  test,
  suspects: reproduction.suspects ?? [],
  investigations: reports,
  ranking: ranking ? ranking.ranking : null,
  failed,
  uninvestigated,
  next: ranking
    ? 'Fix with the failing test in hand. The fix is done when that test goes green and the rest of the suite still passes.'
    : 'The ranking stage failed. Read the investigations and rank the causes yourself, or rerun.',
};
