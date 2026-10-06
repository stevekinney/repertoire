export const meta = {
  name: 'worktree-swarm',
  description:
    'Runs a set of independent, pre-partitioned tasks in parallel, one line cook per task in its own worktree, with a junior engineer checking every brief before any work starts and a referee ruling on every result. Returns a handoff for the integrator skill; it never merges. Use when a plan splits along clean file ownership. Not for coupled tasks, and not for work you have not partitioned yet.',
  whenToUse: 'When an approved plan has several tasks that own separate files and each has acceptance checks a referee can rule on.',
  phases: [
    { title: 'Check briefs', detail: 'a junior engineer reads each task; blocking questions stop the run before any work' },
    { title: 'Build', detail: 'one line cook per task, each in its own worktree' },
    { title: 'Referee', detail: 'a verdict per task from the acceptance condition and the evidence' },
  ],
};

// Inputs:
//   args.tasks  [{ id, title, brief, paths: [owned paths], acceptance: 'the condition, with the commands that check it' }]
//   args.base   The branch every worktree starts from (default: main).
//   args.force  Set to true to start the cooks even when the junior engineer has blocking questions.

const base = typeof args?.base === 'string' ? args.base : 'main';
const force = args?.force === true;
const tasks = Array.isArray(args?.tasks) ? args.tasks.filter((t) => t && typeof t.id === 'string' && typeof t.brief === 'string') : [];
if (tasks.length === 0) return { status: 'no input', message: 'Pass args.tasks: [{ id, title, brief, paths, acceptance }].' };

const incomplete = tasks.filter((t) => !Array.isArray(t.paths) || t.paths.length === 0 || typeof t.acceptance !== 'string' || !t.acceptance.trim());
if (incomplete.length > 0) {
  return { status: 'incomplete tasks', tasks: incomplete.map((t) => t.id), message: 'Every task needs owned paths and an acceptance condition before a line cook can start. Write them, or run the plan through the plan-writer skill first.' };
}

const overlapping = [];
for (let i = 0; i < tasks.length; i++) {
  for (let j = i + 1; j < tasks.length; j++) {
    const shared = tasks[i].paths.filter((p) => tasks[j].paths.some((q) => q === p || q.startsWith(p.replace(/\/?$/, '/')) || p.startsWith(q.replace(/\/?$/, '/'))));
    if (shared.length > 0) overlapping.push({ tasks: [tasks[i].id, tasks[j].id], shared });
  }
}
if (overlapping.length > 0) return { status: 'overlapping ownership', overlapping, message: 'Two tasks own the same path. Split the ownership before starting, or run them in order.' };

const QUESTIONS_SCHEMA = {
  type: 'object',
  required: ['blocking', 'nonBlocking', 'definitionOfDone'],
  properties: {
    blocking: { type: 'array', items: { type: 'string' } },
    nonBlocking: { type: 'array', items: { type: 'string' } },
    definitionOfDone: { type: 'array', items: { type: 'string' }, description: 'Observable conditions and the commands that check them.' },
  },
};

const COOK_SCHEMA = {
  type: 'object',
  required: ['status', 'branch', 'commit', 'summary', 'checks', 'unfinished'],
  properties: {
    status: { type: 'string', enum: ['complete', 'partial', 'blocked'] },
    branch: { type: 'string' },
    commit: { type: 'string', description: 'The commit the branch points at.' },
    worktree: { type: 'string', description: 'The absolute path of your worktree (pwd).' },
    summary: { type: 'string', description: 'What changed, by file.' },
    checks: { type: 'array', items: { type: 'object', required: ['command', 'exitCode', 'output'], properties: { command: { type: 'string' }, exitCode: { type: 'integer' }, output: { type: 'string' } } } },
    unfinished: { type: 'array', items: { type: 'string' }, description: 'What could not be finished or had to be guessed.' },
    unverified: { type: 'array', items: { type: 'string' }, description: 'Checks you could not run, with the error.' },
    affectsOthers: { type: 'string', description: 'Anything found that affects another task\'s slice.' },
  },
};

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['verdict', 'reason'],
  properties: { verdict: { type: 'string', enum: ['met', 'not met', 'impossible'] }, reason: { type: 'string' }, missing: { type: 'array', items: { type: 'string' } } },
};

const taskText = (t) => `Task ${t.id}: ${t.title ?? ''}\nBrief: ${t.brief}\nOwned paths: ${t.paths.join(', ')}\nAcceptance: ${t.acceptance}\nBase: ${base}`;

phase('Check briefs');
const reviews = await parallel(
  tasks.map((t) => () =>
    agent(
      `Read this task as the engineer who will build it, without the conversation that produced it. Report every place you would have to guess, blocking questions first (ranked by risk), then non-blocking ones, then the definition of done: the observable conditions and the commands that check them. Do not answer your own questions.\n\n${taskText(t)}`,
      { label: `brief check ${t.id}`, phase: 'Check briefs', agentType: 'repertoire:junior-engineer', schema: QUESTIONS_SCHEMA },
    ),
  ),
);
const blocked = reviews.map((r, i) => ({ id: tasks[i].id, blocking: r ? r.blocking : ['the brief check returned nothing'] })).filter((r) => r.blocking.length > 0);
if (blocked.length > 0 && !force) {
  return { status: 'blocked on briefs', questions: blocked, message: 'Answer the blocking questions and rerun, or pass force: true to start anyway.' };
}
if (blocked.length > 0) log(`Starting despite blocking questions on ${blocked.map((b) => b.id).join(', ')} (force)`);

phase('Build');
const results = await pipeline(
  tasks,
  (t, _, index) =>
    agent(
      `Build exactly this task in your own worktree, branched from ${base}. Touch only the owned paths. Commit your work on a branch named swarm/${t.id} and report that branch. Run the acceptance checks and report each command, its exit code, and the relevant output verbatim. Report anything you could not finish or had to guess, and anything you found that affects another task's files; do not change those files.\n\n${taskText(t)}${reviews[index] ? `\nDefinition of done from the brief check:\n${reviews[index].definitionOfDone.map((d) => `- ${d}`).join('\n')}` : ''}`,
      { label: `cook ${t.id}`, phase: 'Build', agentType: 'repertoire:line-cook', isolation: 'worktree', schema: COOK_SCHEMA },
    ),
  async (cook, t) => {
    if (!cook) return { id: t.id, status: 'no result' };
    const verdict = await agent(
      `Decide whether this stopping condition has been met, from the evidence only. Verdict: met, not met (with what is missing), or impossible (with why). Run the checks in ${cook.worktree ?? 'the cook\'s worktree'} on branch ${cook.branch} at ${cook.commit}.\n\nCondition:\n${t.acceptance}\n\nEvidence:\nChecks:\n${cook.checks.map((c) => `$ ${c.command}\n(exit ${c.exitCode})\n${c.output}`).join('\n\n')}\nUnfinished: ${cook.unfinished.join('; ') || 'none reported'}\nUnverified: ${(cook.unverified ?? []).join('; ') || 'none reported'}`,
      { label: `referee ${t.id}`, phase: 'Referee', agentType: 'repertoire:referee', schema: VERDICT_SCHEMA },
    );
    return { id: t.id, title: t.title ?? '', branch: cook.branch, commit: cook.commit, worktree: cook.worktree ?? '', status: cook.status, summary: cook.summary, checks: cook.checks, unfinished: cook.unfinished, unverified: cook.unverified ?? [], affectsOthers: cook.affectsOthers ?? '', verdict: verdict ?? { verdict: 'unverified', reason: 'the referee returned nothing' } };
  },
);

const handoff = results.filter(Boolean);
const met = handoff.filter((r) => r.verdict?.verdict === 'met');
log(`${met.length} of ${tasks.length} task(s) met their condition`);

return {
  status: 'done',
  base,
  totals: { tasks: tasks.length, met: met.length, notMet: handoff.filter((r) => r.verdict?.verdict === 'not met').length, impossible: handoff.filter((r) => r.verdict?.verdict === 'impossible').length, unverified: handoff.filter((r) => r.verdict?.verdict === 'unverified').length, noResult: tasks.length - handoff.filter((r) => r.status !== 'no result').length },
  forced: blocked,
  handoff,
  mergeOrder: met.map((r) => ({ branch: r.branch, commit: r.commit })),
  next: 'Run the integrator skill in an ordinary session from this handoff: merge the met branches one at a time with the full checks after each. Branches whose condition was not met need another pass or a person. Every swarm/<id> branch and its worktree remains; rerunning the workflow continues an existing swarm/<id> branch, and merged or abandoned ones should be removed with `git worktree remove` and `git branch -d`.',
};
