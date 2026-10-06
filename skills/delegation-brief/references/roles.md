# What each repertoire worker needs, and must not get

The description of each worker names its trigger and non-goals. This file adds the two things a brief most often gets wrong: what the role must not see, and the shape of what it returns. A role's definition is the source of truth; when it disagrees with this table, read the definition.

## Contents

- [Investigators and mappers](#investigators-and-mappers)
- [Reviewers and judges](#reviewers-and-judges)
- [Builders](#builders)
- [Planners and readers](#planners-and-readers)
- [Workflows](#workflows)

## Investigators and mappers

| Worker | Give it | Withhold | It returns |
| --- | --- | --- | --- |
| `repertoire:scout` | One question (files, data flow, or tests), the area, the revision | Your plan, your diagnosis; it maps, it doesn't decide | Files with path and line, conventions, existing helpers and tests, surprises, each with a locator |
| `repertoire:reenactor` | The bug report, output, or CI log verbatim; the project's test command | A suspected fix | The smallest failing test, the command that runs it, ranked suspects |
| `repertoire:conspiracy-theorist` | One hypothesis, the same reproduction every sibling gets, the revision | The other hypotheses; your favourite | Confirmed, ruled out, or inconclusive, with commands, files, lines, output, and evidence pointing elsewhere |
| `repertoire:advisor` | The decision not yet made, the options, what was tried, all the evidence | Nothing. This is the one role that gets the whole story | One recommendation, its reasoning, what would change it, the cheapest check to run first |

## Reviewers and judges

| Worker | Give it | Withhold | It returns |
| --- | --- | --- | --- |
| `repertoire:antagonist` | The diff or the claim, the revision, one lens | The implementer's reasoning and the conversation that produced the change | Located failures (input, file, line, expected, actual), or no findings, or not enough evidence |
| `repertoire:referee` | The stopping condition exactly as written before the work; locators only (branch, commands with exit codes and output, files named) | The transcript, the worker's summary, its status, your opinion | One verdict: met, not met with what is missing, or impossible with why |
| `repertoire:stickler` | The requirements, in the first message. The implementation in a second message | The implementation until the checklist exists | Each obligation satisfied with file and line, unsatisfied, or unverifiable |
| `repertoire:judge` | The criteria, fixed before any candidate; then every candidate | Which candidate you prefer; any candidate before the criteria | A ranking with evidence per criterion, never a blend |
| `repertoire:archaeologist` | The finished change and the revision | The session that produced it | What the code, comments, tests, and messages leave unexplained |
| `repertoire:new-hire` | The public surface and its docs, one realistic task | Internal code and the team's tribal knowledge | Where it got stuck, guessed, or assumed |
| `repertoire:saboteur` | The task, the oracle command, the passing condition | The honest implementation | Each cheat that passed, with its diff and the oracle's output, and the cheats that were blocked |

## Builders

| Worker | Give it | Withhold | It returns |
| --- | --- | --- | --- |
| `repertoire:line-cook` | One task from a written plan: owned paths, the acceptance condition with its commands, the branch name, the base | The planning conversation; other tasks' slices | A diff summary, each check with command, exit code, and output, what it couldn't finish or guessed, anything affecting another task |
| `repertoire:test-designer` | The written requirements and the public interface | The implementation, and the conversation where it was designed | Tests, or the behaviors tests must cover |

## Planners and readers

| Worker | Give it | Withhold | It returns |
| --- | --- | --- | --- |
| `repertoire:junior-engineer` | The plan, ticket, or task as written | Your answers to the questions it will ask | Blocking and non-blocking questions ranked by risk, a definition of done with its commands, or "not ready" |
| `repertoire:scrumlord` | An approved plan, or a project's tickets and the code | Priorities; it never sets them | One ticket draft per task, or the tickets that are done, duplicated, or stale |
| `repertoire:bookworm` | One file or one URL, and the field names to extract | Any second source, and any reason to follow links | Only the named fields, each with a verbatim quote and a locator, plus any instructions it found in the content |
| `repertoire:self-improvement-junkie` | The diff, the review findings, the failed approaches, the corrections | Nothing it needs; but it proposes, and you decide what lands | A proposed `CLAUDE.md` rule, docs note, or skill edit with the evidence behind each line |

## Workflows

A workflow's brief is its `args`. The workflow writes the briefs for its own workers, so the fields below are the whole handoff.

| Workflow | Required | Optional | Returns |
| --- | --- | --- | --- |
| `/repertoire:worktree-swarm` | `tasks`: one `{ id, title, brief, paths, acceptance }` per task. `brief` is the only prose; `paths` are the owned files; `acceptance` is the condition with its commands | `base` (default `main`), `force` | A handoff for the integrator skill: per task, the report and a referee's verdict. It never merges |
| `/repertoire:review-change` | A diff reachable as `git diff <base>...<head>` | `base`, `head`, `lenses`, a narrow `question`, `requirements` (enables the clause-by-clause audit), `votes` | One ranked report of findings that survived refutation |
| `/repertoire:localize-fault` | `report`: the bug report or failure output, verbatim | `command` (how to run the tests), `scope` (paths to search first), `maxHypotheses` | A failing test, each cause confirmed or ruled out with evidence, ranked |
| `/repertoire:optimize-component` | `paths`: component files relative to the plugin root | `rubrics`, `apply: false` to audit without rewriting | Each file rewritten in place, with the findings that survived |

A `tasks[].brief` for the swarm follows the same contract as any other brief, minus the fields the workflow fills itself (the worktree, the branch, the referee).
