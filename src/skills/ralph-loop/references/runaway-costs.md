# Runaway loops, and what the governor is for

The harness caps one iteration at best (`--max-turns`, `--max-budget-usd`). Total spend, the iteration cap, stall detection, and the kill switch are the loop's job. None of the loops below had one. Not all were Ralph loops; all were unattended agents with no governor.

## The stories

| What happened | Cost | What would have stopped it |
| --- | --- | --- |
| A cron-driven Claude Code job billed the API instead of a subscription, because `ANTHROPIC_API_KEY` was set in the environment. About $858 the first night, $960 the second | $1,818 | The `ANTHROPIC_API_KEY` refusal in `preflight`, or `MAX_TOTAL_USD` |
| An overnight loop re-sent a very large conversation every 30 minutes | about $6,000 | `MAX_TOTAL_USD`, `MAX_WALL_SECONDS`, and fresh context per iteration so nothing accumulates to re-send |
| A summarizer listed the same directory 14,000 times overnight, until it ran out of token quota | $437 | `MAX_REPEATED_FAILURES` and `MAX_STALLS`: the same action with no kept improvement is a stall |
| `max_iterations: 0` meant "unlimited" and produced 1,966 attempts at the same task | quota | `preflight` refuses a cap of 0, and `MAX_ITERATIONS` is a number |

Sources: [the $1,800 cron](https://dev.to/runvouch/my-claude-code-cron-ran-up-1800-in-two-nights-the-watchdog-that-stops-it-at-2-3npb) (also the $437 summarizer), [the $6,000 overnight run](https://www.makeuseof.com/someone-left-claude-code-running-overnight-and-it-cost-6000/), and [the 1,966 attempts](https://dev.to/sean8/i-accidentally-made-claude-ask-itself-the-same-question-1966-times-1c5h).

None of them tripped an alarm. Each looked like a healthy process doing its job, and the stop was whoever ran out of money or quota first. That is the argument for every cap in `loop.sh` having a number before the first run, and for the stop file: a process you can end without finding and killing a shell.

## `ANTHROPIC_API_KEY`

If the variable is set, `claude -p` bills the API per token instead of using the subscription the user signed in with, and nothing in the output says so. `loop.sh` refuses to start while it is set unless `RALPH_ALLOW_API_KEY=1` is also set, which is the user saying "yes, on purpose". When checking the user's shell, test whether it is set (`[ -n "$ANTHROPIC_API_KEY" ] && echo set`); never print the value.

## Budgeting a run

- Decide the total the user will spend on this loop, then put 10 to 15 percent of it into calibration runs that will be thrown away: `MAX_ITERATIONS=1`, then a handful. These buy information about the prompt and the oracle, not progress.
- The remaining 85 to 90 percent is `MAX_TOTAL_USD` for the real run. Set `MAX_USD_PER_ITERATION` to about twice what the calibration iteration cost, so one bad iteration cannot eat the run.
- Cost depends on the task. Per line of the existing codebase, a full language port ran roughly $0.17; a test-coverage campaign about $0.004. Use the calibration iteration's `total_cost_usd` from `log.tsv` to project, not these figures.
- Do not count on prompt caching between iterations. Whether a fresh process reuses the previous one's cache is unverified; budget as if it does not.

## Governor checklist

Every item maps to a variable or a file in `loop.sh`. Confirm each has a value the user chose before handing off.

| Guard | In `loop.sh` |
| --- | --- |
| Iteration cap | `MAX_ITERATIONS` |
| Spend cap for the run | `MAX_TOTAL_USD` |
| Wall-clock cap | `MAX_WALL_SECONDS` |
| Per-iteration turn and spend caps | `MAX_TURNS_PER_ITERATION`, `MAX_USD_PER_ITERATION` |
| Stall detection | `MAX_STALLS`: consecutive iterations with no accepted improvement |
| Repeated-failure stop | `MAX_REPEATED_FAILURES`: the same rejection reason back to back |
| Kill switch | `touch .ralph/STOP`; checked before every iteration; exit 4 |
| Resource lock | `.ralph/lock`: one loop per repository at a time |
| Per-attempt logs and diffs | `.ralph/attempts/NNNN/` |
| Human integration gate | Accepted work lands on the `ralph` branch only; nothing merges it |
