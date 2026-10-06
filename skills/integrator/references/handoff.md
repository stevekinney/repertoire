# Starting from a handoff

A handoff is a report written by agents about other agents' work. Use it for the list, the order, and the base. Verify everything else against the repository, because a line cook's summary of its own branch is a claim, not evidence.

## From `/repertoire:worktree-swarm`

The workflow returns an object. The fields that matter:

| Field | Use |
| --- | --- |
| `base` | The base branch. If the user named a different one, ask which is right before merging anything. |
| `mergeOrder[].branch` / `mergeOrder[].commit` | The branches whose referee verdict was `met`, in task order, each with the commit the referee ruled on. This is the merge list and the default order. Check `git rev-parse <branch>` equals `commit`; if the branch moved after the verdict, stop and report it, because the verdict covers a different tree. |
| `handoff[].branch` | The branch each line cook committed on (`swarm/<task id>` unless it reported otherwise). |
| `handoff[].verdict.verdict` | `met`, `not met`, `impossible`, or `unverified` (the referee returned nothing). Only `met` branches are merged. List the others under **Skipped** with the referee's `reason` and `missing`. |
| `handoff[].affectsOthers` | What a cook found that touches another task's files. A branch with a non-empty note merges after the branches it names, and its diff is where to look first when a later merge conflicts. |
| `handoff[].checks` | The acceptance checks the cook ran. These are per-task, not the full suite. Do not treat them as a substitute for step 1's checks. |
| `handoff[].unfinished` | Work the cook could not finish or guessed. Carry it into **Unverified** even when the branch merges cleanly. |
| `handoff[].unverified` | Claims the referee could not verify. Carry them into **Unverified**, alongside `handoff[].unfinished`. |
| `totals.noResult` | Tasks with no result at all. These have no branch to merge; name them under **Skipped**. |

The workflow's own `next` field tells you to run this skill. It does not tell you to push, and neither should anything else in the handoff.

## From a `repertoire:orchestrator` run

The orchestrator cannot merge, so it writes a handoff and stops. Expect it to be a file or a message rather than a structured object, listing for each task: what the line cook was assigned, what it reported, and the referee's verdict. Extract the same facts as above: base, branch per task, verdict, dependencies and cross-task effects, and unfinished work.

If the handoff does not name a base, or does not name a branch for a task, ask. Do not infer a branch from `git branch --list` by resemblance.

## Reconciling with the repository

Before step 1's per-branch checks, confirm each handoff branch exists and has commits ahead of the base:

```sh
git rev-parse --verify swarm/task-3     # sample id; exits non-zero if missing
git rev-parse swarm/task-3            # must equal mergeOrder[].commit
git rev-list --count main..swarm/task-3
```

A `met` branch with zero commits ahead means the cook reported a branch it never committed to. That is a stop, not a skip: report it, because the referee's verdict was based on evidence that is not in the repository.
