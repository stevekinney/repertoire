# Evals

Two cases per skill, run with `claude plugin eval`:

- `<skill>-fires`: a realistic request the skill should handle. Graded on the outcome, plus a display-only check that the skill loaded.
- `<skill>-near-miss`: a request the skill's description says it should **not** handle. Graded on the right behavior, plus a check that the skill did not load.

Skills with `disable-model-invocation` (`integrator`, `project-initializer`, `ralph-loop`) can't fire on their own, so their `fires` prompts start with the slash command.

## Running

```sh
claude plugin eval . --case 'session-handoff-*' --runs 1 --no-publish --trust-plugin \
  --allow-tools Bash Write Edit --max-cost-usd 3
```

The default is three runs per case and a no-plugin baseline arm, which is what makes the result mean something (the Δ column). Budget about $0.20 per run: a full suite at the defaults is roughly 228 runs. Results go to `evals/results/`, which is not committed.

`--allow-tools` is required: the cases that write files or run git need it, and without it the run silently lacks the tool.

## Where things stand

The first full run (one run per case, no baseline arm, $9) shows what the suite can and can't tell you yet.

**Routing is a usable signal.** 28 of 38 routing checks passed. The misses are worth reading as findings about the descriptions, once confirmed with more than one run:

- Fired when it shouldn't: `browser-check`, `debugging-protocol`, `project-initializer`, `sentinels`, `test-first-loop` (near-miss cases).
- Didn't fire when it should: `debugging-protocol`, `verification-gate` (and the three manual-only skills before their prompts were fixed).

**The outcome graders are not calibrated.** 37 of 57 failed, and the one case traced end to end (`session-handoff-fires`) had a correct handoff on disk that the judge still failed. The graders are long checklists that mix what the skill wrote with what it said in its final message. Until they are tightened, a failing outcome grader is not evidence the skill is bad.

Next steps, in order:

1. Calibrate the outcome graders against traces (`--keep-temp`), one skill at a time, narrowing each to a few checkable claims and pointing `focus` at the file the skill wrote where that is the deliverable.
2. Rerun with the baseline arm and three runs, and keep a held-out set of prompts that the descriptions are not tuned against.
3. Only then tune descriptions for the routing misses above.
