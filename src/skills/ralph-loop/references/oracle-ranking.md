# Choosing and proving the oracle

The oracle is `measure()` in `loop.sh`: the check that decides whether an attempt moved the work forward. It fails silently. A bad oracle keeps returning "fine", and every later iteration builds on nothing. Pick the strongest one the task allows, then prove it can say no.

## The ranking

Strongest first. Each row beats the next because it is harder for an agent to satisfy by accident or by gaming.

| Rank | Oracle | Why it beats the next | Score |
| --- | --- | --- | --- |
| 1 | An exit code from a search you wrote: `rg -l '<old API>' src/` exits 1 when nothing matches | Binary, deterministic, and the agent cannot argue with it. The only way to pass is for the pattern to be gone | `-(matching files)` |
| 2 | An error count from a compiler or linter: `tsc --noEmit`, `cargo check`, `ruff` | The count is produced by a tool the agent does not control, but it can drop by deleting code as well as by fixing it | `-(errors)` |
| 3 | A parity harness: run the old and new implementations on the same inputs and diff | Proves behavior, not just compilation. It can be gamed by narrowing the inputs, so keep the input set outside the agent's write scope | `-(mismatches)` |
| 4 | A green test suite | Tests encode intent, but a test can be weakened, skipped, or deleted. The veto list has to protect the test files | `-(failures)` |
| 5 | A coverage percentage | A test that runs code without asserting raises it. Use only for a coverage campaign, and pair it with "every new test has an assertion" in the veto review | `percent - 100` |
| 6 | An LLM referee | Advisory only, after the mechanical checks pass. It sees the task and the diff with read-only tools and returns a verdict. Never the sole oracle | not a score |

Combine ranks when the task allows: for a migration, rank 1 decides done and rank 4 is a gate inside `measure()` (a non-zero test exit returns failure, so the attempt is rejected regardless of the search count).

## The score

- An integer. Higher is better, and the maximum means done. Use the negative of what remains, so `is_done` is `score >= 0`.
- One number. If two facts matter, decide which one is the target and make the other a gate: it must hold, or `measure()` returns non-zero.
- Print the facts after the score, tab-separated, so the log is readable: `-5<TAB>type_errors=5 tests=pass`.

## Fail closed

`measure()` must exit non-zero when it cannot measure. The failure mode to prevent: a missing binary makes "count the errors" print `0`, which looks like done. For every tool the oracle calls:

- Prove the binary exists before counting (`npx tsc --version >/dev/null || return 1`).
- Count from the tool's output, not from its exit code alone. `grep -c` on an empty stream prints `0` and exits 1; decide which you mean.
- The exit code the loop trusts comes from your check, never from the agent's own process. `claude -p` can exit 0 after a run that did nothing.

## Known-bad changes

Before the loop runs, prove the oracle can fail. Make each change in a scratch worktree (`git worktree add --detach /tmp/oracle-check HEAD`), run `measure()` against it, record the output verbatim, and remove the worktree. At least two changes, of two kinds:

1. **A regression:** reintroduce one instance of the problem. One `const n: number = "x"` for a type-error loop; one call to the old API for a migration; one broken assertion for a test-suite oracle. The score must drop by exactly the amount you expect. If it does not drop, the oracle does not see the thing the loop is for.
2. **A gaming move:** the shortcut an agent would take. Delete a failing test; add `// @ts-ignore`; skip a test with `.skip`; add a test with no assertion; narrow a `tsconfig` `include`. The score must not rise. If it does, either add the path to `VETO_PATHS` or strengthen the check (count `ts-ignore` and `.skip` as errors).

Record both results in the report. The most common false success here is an oracle that passes against an empty checkout: run it once against a directory with no source files and confirm it fails rather than reporting zero errors.
