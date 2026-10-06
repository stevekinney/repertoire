# Ranking markers and exit conditions

Read this when choosing between a completion string and a file, when a loop's exit condition is in question, or when auditing a scheme someone else built.

- [The one test](#the-one-test)
- [Two kinds of sentinel](#two-kinds-of-sentinel)
- [Markers, weakest to strongest](#markers-weakest-to-strongest)
- [Exit conditions, weakest to strongest](#exit-conditions-weakest-to-strongest)
- [The cheaper alternatives](#the-cheaper-alternatives)
- [Completion strings in practice](#completion-strings-in-practice)
- [File sentinels in practice](#file-sentinels-in-practice)
- [Anti-patterns](#anti-patterns)
- [Stronger designs](#stronger-designs)

## The one test

A good marker is at least as hard to satisfy as the work it stands for. A sentinel inherits the classic sentinel-value flaw: if real data can look like the sentinel, the loop stops early. Everything below is a way of measuring how hard a given marker is to produce by accident or on purpose. Always know which rung you are relying on.

## Two kinds of sentinel

- **Completion sentinel:** a string the model writes into its own output, such as `<promise>COMPLETE</promise>`. A bash loop or a `Stop` hook searches the output for it.
- **File sentinel:** a file on disk that outlives the session. A later session, a hook, or a scheduler reads it to decide whether to resume or proceed.

They fail in opposite ways. A string is easy to emit by accident, but a false one dies with the transcript. A model doesn't create a file by accident the way it prints a sentence, but a false file persists and gets trusted by a reader with none of the original context. Code can write one for the wrong reason too; see the four-outcomes trap under [Anti-patterns](#anti-patterns).

## Markers, weakest to strongest

The tokens that claim the work is done:

1. `touch done`. Costs the agent nothing; any process can create it at any time.
2. A promise string. The model controls the verdict.
3. A `"passes": true` field in a JSON file. Structured, checkable, keyed, but still written by whoever runs the writer. The `sentinel.mjs` marker is here on its own.
4. A test suite's exit code. Re-derived each time, but the agent can edit the tests.
5. A check of the files on disk plus tests the agent can't edit.
6. A marker written by an independently protected writer, CI job, or human.

Rung 6 holds only when the agent cannot write the marker or alter the writer, its dependencies, or its configuration. A repository hook the agent can edit does not meet that condition.

## Exit conditions, weakest to strongest

The things that tell a loop to stop:

1. A string in the output.
2. A tool call that declares completion (OpenHands `finish`, Codex `update_goal`, Claude Code's `/loop` with `stop: true`). The model still decides, but through a structured action that is harder to emit by accident than a sentence.
3. A separate model judging the transcript.
4. An agent hook that inspects the repository.
5. A deterministic check: an exit code, a `jq` query, an empty diff.
6. A validated artifact: its contents satisfy the contract and its downstream checks pass.

File presence only says something was written. A ported module can exist without compiling, and a generated report can be empty or partial, so validate an artifact's contents and behavior before treating it as an exit condition. Even an empty marker from a trusted external process is still a claim about a check: bind it to the exact artifact and verify the evidence behind it.

## The cheaper alternatives

Each is easier to trust than a file nobody can re-derive, so try them in this order:

| Alternative | Use it when |
| --- | --- |
| Re-derive the fact | The check is cheap enough to run every time. Then there is no sentinel. |
| A Git note | The fact is about one commit ("I reviewed this commit") and must not change the commit. |
| A Git tag | The fact marks a point in history that people will look for. |
| A real database or queue | The project already has one and the fact is a record, not a flag. |
| The issue tracker | The fact is a workflow state humans also manage. |
| A lock | All you need is "only one worker does this at a time". `write --claim` is a lock in a pinch. |
| A sentinel file | None of the above fits. |

## Completion strings in practice

Each harness wires the completion sentinel differently:

- **A bash loop:** a fresh process every pass. Run the agent, substring-match its output for the token, exit non-zero when the iteration cap is hit. Safe only when the token is distinctive, alone on the last line, and backed by a real check.
- **The `ralph-wiggum` plugin:** `/ralph-loop "<prompt>" --max-iterations <n> --completion-promise "<text>"`. A `Stop` hook returns `{"decision":"block","reason":<the same prompt>}` until the promise matches or the cap is reached. Its comparison is strict but can't tell a declaration from a mention: it takes the first promise tag pair in the last message, collapses whitespace, and compares exactly; a sentence that merely mentions the promise, tags included, still matches; a bare `DONE` as the whole last message matches through a fallback. `--max-iterations` defaults to unlimited. Always set it, with a space and not `=`; `--max-iterations=5` is silently read as part of the prompt.
- **Claude Code's `/goal`:** a small model returns met, not yet met, or impossible after each turn.
- **Codex's `/goal`:** the model declares completion through an `update_goal` tool call after an audit spelled out in the continuation prompt.
- **`Stop` hooks in general:** returning `decision: block` keeps the agent working. `stop_hook_active` means this hook's last block already forced a continuation; checking it lets the hook allow the second stop, which turns the gate into a single nudge. Read `last_assistant_message`, not the transcript, which can lag behind the current turn.

## File sentinels in practice

A new session needs state it can read without the old context. A `SessionEnd` hook can save a handoff when the session terminates, but it can't block termination or inject output, and its default budget is 1.5 seconds, so keep the write small and verify it completed. A `Stop` hook can checkpoint after each turn instead; label those records as intermediate so they don't overwrite a final handoff. Read saved state in `SessionStart`, whose `startup`, `resume`, `clear`, `compact`, and `fork` matchers say how the session began.

Files come in three shapes: an empty marker for a gate, whose existence is the whole message; a structured JSON payload that records the outcome; and a prose progress file that orients the next agent and is never gated on. The best design pairs the gate marker with a payload beside it for the audit trail. `sentinel.mjs` folds the two together: the file's presence under its keyed name is the gate, and its `status` and `evidence` fields are the trail.

## Anti-patterns

- **The string as the only exit.** The model controls the verdict.
- **Searching all of the output for the token.** Any mention of it, or an echoed prompt, ends the run.
- **One string standing for every outcome.** Use distinct endings with their own exit codes.
- **A cap nobody enforces.** One documented run passed iteration 459 after its cap was silently ignored. Enforce the cap outside the model.
- **"Please don't cheat" in the prompt.** METR measured a model gaming a scorer on one task in 80% of runs; with "Please do not cheat" added, still 80%.
- **Committing gate sentinels.** A cloned repository arrives with an approval already in it.
- **A sentinel as the only record of something irreversible.** If the file is lost or forged, nothing can re-derive what happened.
- **Treating a progress file as proof.**
- **Spin loops.** Goals that never accept "done". One Codex user found 1.4% of their goal sessions used 49% of their input tokens.
- **The four-outcomes trap.** A genuine approval, a forced approval at the round cap, a write while the reviewer was down, and a human override all produced the same zero-byte file. Every path that isn't a genuine approval must leave a distinct marker, and the gate must deny on it. This is why `write` takes `passed`, `failed`, `blocked`, or `aborted` and `check` expects exactly one.

## Stronger designs

- **Dual condition:** the sentinel and the world check must agree. Log every premature claim and you get a false-completion rate you can track.
- **Proof-carrying markers:** the marker holds a digest of the reviewer's response, a handle the gate can re-query, or a signature from outside the sandbox. A marker that exists but doesn't verify is then positive evidence of gaming. Put the digest or handle in `--evidence`; `check` exit 3 (wrong embedded key) is the built-in version of this.
- **Fallback approvals:** with no approval for the exact tree, fall back to one for the parent commit's tree and review only the diff.
- **Git notes for commit-scoped facts:** "I already reviewed this commit."
- **Validated artifacts:** the work product can serve as the record, but only after its contents and downstream checks satisfy the contract.
- **Control channels from you to the loop:** editing `loop.md` steers a running `/loop`; a stop file such as `.ralph/STOP` is a kill switch the loop checks every iteration.
