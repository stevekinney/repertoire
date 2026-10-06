---
name: agentic-coding-patterns
description: "Routes a recurring failure with coding agents, or a task about to start, to one of fifteen patterns, checks the pattern's reasons not to use it, and names the repertoire component or mechanism that implements it. Use when an agent claims done too early, a plan went wrong late, a session repeats a past dead end, or an unattended run must be made safe. Not for executing a pattern, debugging one bug (debugging-protocol), writing a plan or spec (plan-writer, interview-to-spec), or authoring a component (skill-builder)."
---

# Agentic coding patterns

Match the failure you are hitting to one pattern, check the pattern's own reasons not to use it, and hand the work to the component that implements it. This skill decides; it does not execute. Every pattern is an idea, and whether it is enforced by prose, a hook, a permission rule, or CI is a separate choice made in step 5.

## Inputs and scope

- **Input:** a symptom ("it said done and the feature is broken", "the plan was wrong and we found out at the diff", "this session redid yesterday's dead end", "the loop ran all night and produced nothing") or a task that has not started yet. If neither is given, ask which of the four problems below is closest, and stop until answered.
- **Reads:** the project's instructions file for verified commands, existing hooks and permission rules, and any progress or plan file.
- **Writes:** nothing. The component you hand off to owns its own writes, verification, and rerun behavior.

## The four problems

| Problem | You see | Patterns |
| --- | --- | --- |
| Proving it works | A green check that lied; "done" with no command behind it; tests the agent wrote that assert nothing | Verification loop, test-driven agent loop, test ratchet, mutation gate, fresh-context reviewer |
| Deciding what to build | A large diff on the wrong approach; requirements that turned out to be guesses; a fix in the wrong file | Research, plan, implement; interview to spec; fault localization first |
| Keeping context useful | The agent runs the wrong build twice; a fresh session repeats a known dead end; the same correction every week | Instructions as a testing contract, progress file, compound engineering |
| Running unattended work | A loop that spun or spent without finishing; an approval you clicked without reading; parallel agents tangling edits | Ralph loop, circuit breaker, human-gated autonomy, parallel worktree swarm |

## Procedure

1. **Name the problem from the symptom.** When the symptom fits two rows, choose Proving it works unless only the user's history can decide (see Stopping rules); an agent reporting completion it has not earned is the most common failure, and the other three groups assume this one is already handled.
2. **Pick one pattern from the table below.** One per failure. The user asking for "all of them" is a request to pick the one for the failure they hit most often, then stop. Say so.
3. **Check the when-not column against the task before anything else.** If it applies, say which clause applied, drop the pattern, and either pick the next in the same row or report that no pattern fits. A pattern on the wrong problem adds ceremony and false confidence.
4. **Discover the local facts the pattern depends on.** Read the instructions file for the check commands and what passing looks like; look for hooks, permission rules, and a progress or plan file. If the repository has no verified check commands, route to the testing contract first, whatever the original symptom, because every other pattern uses those commands as its oracle.
5. **Read the one reference for the problem, then hand off.** Name the component and give it the inputs the reference lists. When the implementation is a mechanism rather than a component (a hook, a CI check, a command-line limit, a mutation tool), name the mechanism and the rung it belongs on.

## The fifteen patterns

Skills are named bare, subagents as `repertoire:<name>`, workflows as `/repertoire:<name>`. The reference files carry the full list for each pattern; this column holds the entry point.

| Problem | Pattern | When not | Implemented by |
| --- | --- | --- | --- |
| Proving it works | Verification loop | No mechanical oracle, or the only gate is a weak agent-written suite; for a one-line change, run the one test | `verification-gate` in the main session; `browser-check` for UI; `repertoire:referee` when the finish takes judgment |
| Proving it works | Test-driven agent loop | Tests already exist and the job is to pass them; the spec is too vague to encode; the integration harness can't be stood up | `test-first-loop` in the main session (it delegates to `repertoire:test-designer`); `repertoire:reenactor` for a bug |
| Proving it works | Test ratchet | A test is genuinely wrong (fix it as a separate approved change); a measure with no direction, like test count; an instruction with no mechanism behind it | A hook or CI check against the base branch; `repertoire:saboteur` to find the holes first |
| Proving it works | Mutation gate | Whole-repository on every change; code with nothing to assert; chasing a score | The project's mutation tool, scoped to the diff, survivors reported (no repertoire component) |
| Proving it works | Fresh-context reviewer | As a replacement for executable checks; trivial changes; no round limit set | `/repertoire:review-change`; `repertoire:antagonist`, `repertoire:stickler`, `repertoire:archaeologist` |
| Deciding what to build | Research, plan, implement | Small changes in known code (plan mode is enough); a hard problem it can't make easier; unattended, where nobody reads the plan | `plan-writer`; then `repertoire:line-cook` or `/repertoire:worktree-swarm` |
| Deciding what to build | Interview to spec | Small clear tasks; requirements already written (hand over the document); the user can't answer the questions | `interview-to-spec`; `ticket-dossier` first; `repertoire:junior-engineer` after |
| Deciding what to build | Fault localization first | The issue names the file and line; the diff fits in one sentence; a small suite makes the coverage ranking meaningless; unbounded search | `/repertoire:localize-fault`; `debugging-protocol` in the main session |
| Keeping context useful | Instructions as a testing contract | Documenting the whole build system; a command you haven't verified; fast-changing details; commands that belong in a script | `project-initializer` |
| Keeping context useful | Progress file | A task that fits one session; in place of commits; mixed with the plan; never rotated | `session-handoff`; `project-initializer` creates it |
| Keeping context useful | Compound engineering | Throwaway projects; many-team codebases where lessons outgrow pruning (load on demand instead); lessons the agent writes without review | `repertoire:self-improvement-junkie`; `skill-builder` when the lesson is a method |
| Running unattended work | Ralph loop | No command can say it's done; judgment calls or production debugging; mature codebases full of unwritten conventions; anything irreversible | `ralph-loop` builds the runner, oracle, and limits (manual-only, so tell the user to invoke it by name); `project-initializer` first on a fresh repository; `session-handoff` per pass; `sentinels` for the stop marker; `repertoire:referee` when the stop takes judgment |
| Running unattended work | Circuit breaker | Leaving it out is not the risk, setting it wrong is: never raise a limit without knowing why the run hit it | `ralph-loop` sets count, spend, time, and stall limits in its governor (manual-only, invoke by name); for any other runner, the limits live in its flags (`--max-budget-usd`) outside the agent's control |
| Running unattended work | Human-gated autonomy | In place of a sandbox when production credentials are reachable; the plan gate on one-line changes; gates you approve without reading | Permission rules and the sandbox; `repertoire:bookworm` for untrusted input; `repertoire:junior-engineer` at the plan gate; `commit-and-pr-author` and `integrator` stop at the merge gate |
| Running unattended work | Parallel worktree swarm | Coupled work (do it in order); shared database, ports, and caches; more agents than you can review; subscription quota | `/repertoire:worktree-swarm`; `repertoire:scrumlord` to split; `integrator` to merge; `repertoire:judge` for best-of-N |

## References

Read exactly one, chosen by the problem from step 1. Each gives every pattern in the group its what, how, when, when not, and the full set of repertoire components that carry it out.

- [references/proving-it-works.md](references/proving-it-works.md): when the problem is proving it works, or when a green check has lied.
- [references/deciding-what-to-build.md](references/deciding-what-to-build.md): when the problem is deciding what to build, or the task hasn't started and the approach is uncertain.
- [references/keeping-context-useful.md](references/keeping-context-useful.md): when the problem is keeping context useful, or the agent repeats a mistake across sessions.
- [references/running-unattended-work.md](references/running-unattended-work.md): when the problem is running unattended work, or anyone plans to walk away from a run.

## Stopping rules

- **Finish** once one pattern is named, its when-not is checked, and a component or mechanism is named with its inputs. Do not continue into executing it; invoke the component and let it run under its own rules.
- **Skip the whole routing** for a one-line change the user could describe in a sentence. Say so and hand it back to the main session to make the change and run the one test that matters.
- **Stop and report** when every pattern in the row is ruled out by its when-not clause. Say which clauses fired; don't force a fit.
- **Ask** when the symptom could belong to two problems and only the user's history decides (a loop that spun could be a missing oracle or a missing breaker), or when the pattern's cost is real and unstated (a ratchet turns fixing a bad test into a human-approved change).

## Failure handling

- **No verified commands in the repository:** route to the testing contract and say why the original request waits on it.
- **The named component isn't available in this session:** name the mechanism the pattern needs and report the hand-off as unverified rather than improvising the component's job here.
- **Rerun:** safe. This skill writes nothing, so running it again on the same symptom produces the same routing and no side effects.

## Done and report

Done is observable in the hand-off itself: one pattern named, one when-not clause checked in a sentence, one reference read, and one component invoked or one mechanism named with the rung that enforces it.

Report in four parts:

- **Completed:** the pattern, the symptom that chose it, the when-not check, and the component or mechanism handed to.
- **Failed:** no pattern fit, with the clauses that ruled each out.
- **Skipped:** patterns in the same row considered and rejected, one clause each.
- **Unverified:** any mechanism named but not yet in place (a hook to write, a limit to set, a tool to install). It isn't a guarantee until it exists outside prose.
