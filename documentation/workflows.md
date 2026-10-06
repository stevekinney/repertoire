# Writing workflows

A workflow is a JavaScript script that orchestrates many subagents. The script holds the plan: the loop, the branching, and the intermediate results. Claude's context holds only the final answer. Read [`authoring.md`](authoring.md) first. It covers choosing the mechanism, descriptions, verification, safety, and evals, which apply here too.

Workflows are written directly in `workflows/<name>.js`. They're plain JavaScript, not TypeScript, and nothing builds them. A workflow in this plugin runs as `/repertoire:<meta.name>`.

Identifiers such as `GATE-3` come from the Workflows rubric in the Lost Gradient vault. Items marked **(lint)** are enforced by `bun run lint`; everything else is judgment, checked in review.

## When a workflow is the right mechanism

Skills, subagents, and workflows can all run multi-step work. The difference is who holds the plan:

| | Skill | Subagent | Workflow |
| --- | --- | --- | --- |
| Who decides what runs next | Claude, following instructions | Claude, turn by turn | The script |
| Where intermediate results live | Claude's context | Claude's context | Script variables |
| What's repeatable | The instructions | The worker definition | The orchestration itself |
| Scale | A few delegated tasks per turn | Same | Dozens to hundreds of agents per run |
| Interruption | Restarts the turn | Restarts the turn | Resumable in the same session |

Before writing one, complete this sentence, the workflow counterpart of the subagent justification gate:

> Compared with Claude orchestrating this turn by turn, a script materially helps because ___. The expected benefit can be checked by ___.

At least one of these should hold:

- **Scale:** more items or agents than one conversation can coordinate, such as an audit of every route or a 500-file migration.
- **Repeatable orchestration:** the same fan-out runs again and again, and the shape of the run should be fixed, readable, and diffable.
- **A quality pattern:** independent agents verify each other before anything is reported (see [Verification patterns](#verification-patterns)).

A workflow is the wrong choice when:

- The task is small. Every agent costs a fresh context, and a typo fix doesn't need a fan-out (`SIZE-1`).
- The work needs a person's sign-off partway through. A run can't take input once it starts, so split it into one workflow per stage and approve between them (`GATE-2`).
- The process is a fixed sequence with one agent per step. That's a skill.
- You don't know the work-list yet. Scout first, by listing the files or scoping the diff, then fan out over what you found.

## Structure

Every script starts with a `meta` block, followed by a body that calls `agent()`, `pipeline()`, `parallel()`, `phase()`, and `log()`:

```javascript
export const meta = {
  name: 'audit-routes',
  description: 'Audits every route handler for missing authentication checks. Use when reviewing API security across a codebase; not for reviewing a single diff.',
  whenToUse: 'Before a release, or after adding routes in bulk.',
  phases: [
    { title: 'Find', detail: 'one agent per route file' },
    { title: 'Verify', detail: 'three skeptics per finding' },
  ],
};

const files = args?.files ?? [];
if (files.length === 0) return { status: 'no input', findings: [] };

// …
```

- **`meta` is a pure literal** and the first statement: no variables, function calls, spreads, or template interpolation. Otherwise the command drops out of `/` autocomplete. **(lint)**
- **`name` and `description` are required.** The description rules in [`authoring.md`](authoring.md#2-write-descriptions-that-route) apply: third person, what and when, near-misses named. The description also appears in the approval prompt, so say what the run will do. `meta.name` is kebab-case and matches the filename, and the description is in the third person and at most 1,024 characters. **(lint)**
- **`phases` titles match `phase()` calls exactly.** A title with no entry gets its own progress group, and an entry nothing uses is dead weight. **(lint)**
- **Plain JavaScript only.** Type annotations fail to parse, and a script containing `import()` fails before it starts. Put work that needs a library inside an agent's task. **(lint: `import()`)**
- **No filesystem or shell access from the script.** Agents read, write, and run commands; the script coordinates them.
- **Inputs arrive through `args`**, never hardcoded. Paths, issue numbers, questions, and timestamps are all inputs. When `args` is missing or empty, return early with a clear status rather than guessing (`RECOVERY-1`).

## Decomposition

- Stages sit on real boundaries, where the work, the information, or the reviewer changes (`STAGE-1`).
- Each stage uses the right mechanism: an agent for judgment, plain script code for deduplication, counting, and filtering, and a separate workflow or a person for approval (`STAGE-2`).
- Don't split stages for appearance, and don't wrap a fixed sequence in a router (`STAGE-3`).
- To run one of this plugin's subagents as a worker, pass `agentType`. Its `tools` allowlist and system prompt then apply, and the guidance in [`subagents.md`](subagents.md) covers it. A `repertoire:` agent type must exist in `agents/`. **(lint)**

## Orchestration

- **Default to `pipeline()`.** Each item moves through every stage on its own, so a fast item doesn't wait for a slow one.
- **Use a barrier (`parallel()` between stages) only when a stage needs every result from the stage before**: deduplicating across all findings before expensive verification, skipping verification when nothing was found, or comparing findings with each other. Flattening, mapping, and filtering don't need a barrier; do them inside a pipeline stage.
- **Give every agent whose output the script reads a `schema`.** The agent then returns validated JSON, and the script never parses prose. A schema needs `type: 'object'` at the root, with `required` keys inside `properties`. **(lint: a schema that contradicts itself, and invalid `effort` or `isolation` values)**
- **Handle `null`.** An agent that's stopped or fails returns `null`, and `parallel()` and `pipeline()` keep it in the results, so `.filter(Boolean)` before using them. Report how many were dropped.
- **Set `phase` in the agent's options** inside `pipeline()` and `parallel()` stages, rather than relying on the global `phase()` call, which other stages can change underneath you.
- **Use plain code for anything deterministic.** Deduplication, counting, sorting, and thresholds don't need an agent.

## Agent prompts

Each `agent()` prompt is a delegation. The [delegation contract](subagents.md#delegation-contract) applies: one bounded assignment, the inputs it needs, scope and non-goals, the expected output, and a stopping condition.

- **Agents start fresh** but get the same `CLAUDE.md` files you did. Don't paste those rules into prompts; name the one rule a stage needs, if any.
- **Data stays data.** File contents, issue text, and fetched pages that flow into a prompt are material to analyze, not instructions (`SAFETY-3`).
- **Keep fan-out agents alike.** Agents with the same model, effort, agent type, tools, schema, and working directory share a prompt-cache prefix, so later agents in a fan-out start cheaper. Vary the task, not the setup.

## Verification patterns

A workflow can check its own findings before reporting them, which is often the reason to write one at all.

- **Adversarial verification:** for each finding, several independent agents try to refute it, and it survives only if a majority fail to. Tell verifiers to default to "refuted" when uncertain.
- **Diverse lenses:** when a finding can fail in more than one way, give each verifier a different lens (correctness, security, does it reproduce) instead of several identical skeptics.
- **Judge panel:** for design questions, generate several independent approaches from different angles, score them with separate judges, and build on the winner.
- **Loop until dry:** for discovery of unknown size, keep running finders until two rounds in a row find nothing new. Deduplicate against everything seen, not just what was confirmed, or rejected findings come back every round and the loop never ends.
- **Completeness critic:** a final agent asks what's missing (a source not read, a claim not verified), and its answer becomes the next round of work.

Rules for every gate:

- Verify at the boundary where it's cheapest and most informative, not only at the end (`GATE-1`).
- Every review loop has a stopping rule and a definition of a finding (`GATE-3`).
- "Couldn't verify" is its own outcome. A claim a verifier couldn't check, after an API error for example, is unverified, not refuted and not confirmed.

## Ownership and independence

- The script, or the person reading its result, accepts each result. Workers return evidence; plain code or a final synthesis stage decides (`OWNER-1`).
- Fan-out is justified and bounded (`OWNER-2`). If the script caps coverage with a top-N, a sample, or no retries, `log()` what was dropped. A silent cap reads as "covered everything" when it didn't.
- Reviewers stay independent of each other and of the implementer. Don't show a verifier the other verifiers' verdicts or the finder's reasoning (`OWNER-3`).

## Handoffs between workflows

Within a run, state lives in script variables. Across runs, it lives in files:

- When a larger job spans several workflows (understand, then design, then implement, then review), each one ends by having an agent write its result to a file, such as a plan, a report, or a list of findings (`ARTIFACT-1`).
- Tie each artifact to the revision it describes, and say what would make it stale (`ARTIFACT-2`).
- The next workflow checks the artifact instead of trusting it (`ARTIFACT-3`).

A workflow can also run another inline with `workflow('repertoire:<name>', args)`, sharing its budget and agent cap. Nesting goes one level deep only, so the child can't call `workflow()` itself. Reference it by name, never by `{ scriptPath }`, which won't resolve once the plugin is installed. **(lint)**

## Determinism and resume

The runtime makes `Date.now()`, `Math.random()`, and a no-argument `new Date()` throw, so a relaunched run repeats the same `agent()` calls. Pass timestamps in through `args`, stamp results after the run, and vary prompts or labels by index instead of randomly. **(lint)**

A run can be resumed within the same session. On relaunch, agents replay in the order they started:

- A completed agent returns its saved result, until the first agent whose prompt changed. That agent and every agent after it run again.
- A failed agent runs again, and so does every agent that started after it, even ones that completed. A failure in the middle of a fan-out reruns finished work.

What follows from this:

- Make steps idempotent, so a rerun doesn't repeat side effects such as a second commit or a duplicate comment (`RESUME-2`).
- Keep prompts stable. An unnecessary change early in the script invalidates every cached result after it.
- Use `isolation: 'worktree'` only when agents write files in parallel and would otherwise conflict. It's expensive per agent.

## Safety and authority

- Workflow agents use your permission rules, and in auto mode the prompts the script computes don't count as requests from you. The script can't grant itself permissions.
- Keep consequential actions such as pushing, merging, deploying, and deleting out of fan-outs. Put them at a boundary where a person reviews the result first, usually in a separate workflow or back in the conversation.
- Scope each stage's authority to its job. A worker that only reads gets an `agentType` with a read-only `tools` allowlist, not a general-purpose agent.

## Cost and proportionality

- **Size it to the request.** "Find any bugs" warrants a few finders and a single verification pass. "Audit this thoroughly" warrants a larger pool and three to five votes per finding. Document how much process a task needs, and let people enter and leave at any stage (`SIZE-1`, `SIZE-2`).
- **Mind the defaults.** The default size guideline aims for fewer than 10 agents. Claude Code flags a run as large past 25 agents or 1.5 million projected tokens. The runtime caps a run at 16 concurrent agents, 4,096 items per `parallel()` or `pipeline()` call, and 1,000 agents in total.
- **Route models and effort by stage.** Agents inherit the session's model by default, which is usually right. Lower `effort` for mechanical stages, and raise it only for the hardest verification or judging (`SPEND-2`).
- **One fresh context per unit of work**, and bounded fan-out (`SPEND-1`, `SPEND-3`).
- **Try a small slice first,** such as one directory or a narrow question, and watch per-agent token use in `/workflows` before the full run.

## Testing a workflow

- Run it on a small, known input first, and read the run's `journal.jsonl` to see what each agent actually returned. Don't assume cached results are non-empty.
- Give it inputs with known answers: a planted bug it must find, and clean code where it must report nothing.
- Compare it against a simpler baseline, usually one agent with the same skills. A workflow earns its cost only if it produces better accepted results, or the same results more cheaply. Its own output files show that it ran, not that it helped.

## Workflow checklist

- [ ] The justification sentence is complete: scale, repeatable orchestration, or a quality pattern.
- [ ] `meta` is a pure literal with a routing `description`, and `phases` match the `phase()` titles.
- [ ] Inputs come through `args`, and missing input returns a clear status.
- [ ] `pipeline()` by default, with each barrier justified by a cross-item need.
- [ ] Every agent output the script reads has a `schema`, and `null` results are filtered and counted.
- [ ] Findings are verified before they're reported, every loop has a stopping rule, and unverified is its own outcome.
- [ ] Coverage caps are logged, never silent.
- [ ] No `Date.now()`, `Math.random()`, or argless `new Date()`, and steps are safe to rerun.
- [ ] No consequential action inside a fan-out, and each worker's tools match its stage.
- [ ] It has run on a small slice, and its result was checked against a baseline.

## Sources

- Anthropic: [Orchestrate subagents at scale with dynamic workflows](https://code.claude.com/docs/en/workflows) and the [plugin manifest reference](https://code.claude.com/docs/en/plugins-reference), plus Claude Code's bundled workflow-authoring reference (`/workflow-authoring`).
- The Lost Gradient vault: the Workflows rubric.
