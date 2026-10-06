# Patterns for deciding what to build

A wrong approach is cheapest to fix before any code exists. Once it is a two-thousand-line diff, you are reviewing your way out or throwing it away. These three patterns put the expensive thinking up front, where a mistake is still a paragraph. Each answers a different question: how the change should go, what you actually want, and where the bug is before anyone asks how to fix it. The trade pays only when the thing being decided is uncertain. When it isn't, skip the ceremony and build.

## Research, plan, implement

**What it is:** Three phases, each producing a written artifact. Research the code without changing it, write a plan with exact files and checks, then implement one phase at a time against the plan.

**How it works:** Each phase starts fresh with the previous phase's document as its only handoff, and you review those short documents instead of the long diff. Research says what exists, with locators. The plan says what to change, in phases, each with the files it touches and the command that proves it worked. Implementation takes one phase at a time and stops when its check passes.

**When to use it:** For changes in large or unfamiliar code where a wrong approach is expensive: cross-cutting features, removals that touch many files, bug fixes in code you don't know. Also when code review is the bottleneck, because reading a plan is much faster than reading the diff it would have produced.

**When not to use it:** For small changes in code you know well. Plan mode, where the agent reads but doesn't edit until you approve, is enough there, and three review stops are pure overhead. It won't crack a hard problem: it organizes the work, it doesn't make the work easier. And don't run it unattended. The leverage comes from a person reading the research and the plan; if nobody does, you've only added steps.

**Implemented by:** `plan-writer` runs the first two phases and stops for review after each. For research, it runs several `repertoire:scout` agents in parallel, one question each; `ticket-dossier` covers everything around the code (threads, decisions, the ticket it duplicates). Before approving the plan, have `repertoire:junior-engineer` read it cold and list everything it would have to guess; if the change is expensive to reverse, ask `repertoire:advisor` too. Once approved, hand each phase to `repertoire:line-cook`, or to `/repertoire:worktree-swarm` when the phases own separate files, and move on only when `repertoire:referee` says the phase is done. `repertoire:orchestrator` runs that whole dispatch from one place when it is too big for one session.

## Interview to spec

**What it is:** Before planning anything, have the agent interview you until the hard questions are answered. It writes a self-contained spec, and you implement it in a fresh session.

**How it works:** The agent reads the codebase, asks only the questions whose answers would change the design, and keeps asking until the answers stop changing it. What you keep is the spec, not the interview: observable acceptance criteria that stand without the conversation. The fresh session reads the spec and nothing else, so an implementation can't inherit the guesses the interview was meant to remove.

**When to use it:** When you haven't fully thought the feature through yet, which is more often than anyone admits. The questions do work a plan can't, because a plan assumes the requirements are settled. It also helps when several people disagree about what you're building, since the interview surfaces that before the code does.

**When not to use it:** For small, clear tasks, where the interview takes longer than the work. When the requirements are already written down, hand over the document instead. And when you can't actually answer the questions: an interview answered with "you decide" produces a spec full of the agent's guesses with your name on it, which is worse than no spec.

**Implemented by:** `interview-to-spec` runs the interview and writes the spec, with a hard gate against implementing in the same session. Run `ticket-dossier` first, so the interview doesn't ask what the team already decided. Before the fresh session builds, have `repertoire:junior-engineer` read the spec and report anything it would still have to guess.

## Fault localization first

**What it is:** For a bug, treat "where is it?" as its own deliverable, finished before anyone writes a patch.

**How it works:** Reproduce the bug, ideally as a failing test. Then narrow where it lives: search the code by structure, follow the stack trace, and, if tests exist, check which lines the failing tests run that the passing ones don't. Code only the failing tests touch is the most suspicious; that can turn "which of 400 files" into "which of 12 lines." The failing test does two jobs: its trace points at the fault, and later it proves the fix. Keep the exploration out of the context that writes the fix, so the pile of files read while searching doesn't crowd it.

**When to use it:** For bug reports in code the agent hasn't seen, and anywhere the symptom is far from the cause (a UI error that is really a serializer problem). In large repositories, an agent that skips this step reads the wrong files first and anchors on them. If the first guess has been wrong before, look at several candidate locations at once instead of one.

**When not to use it:** When the issue already names the file and line, or the diff fits in one sentence: skip to the fix. Don't lean on the coverage ranking when the suite is small or the failing test runs everything, because the ranking won't tell you anything. And don't let "localize" turn into unbounded exploration: give the search a scope and a budget.

**Implemented by:** `/repertoire:localize-fault` runs the whole pattern: `repertoire:reenactor` turns the report into the smallest failing test with ranked suspects, `repertoire:scout` maps the territory, one `repertoire:conspiracy-theorist` per plausible cause tests its hypothesis in parallel against the same reproduction, and `repertoire:judge` ranks the verdicts. In the main session, `debugging-protocol` keeps the agent from guessing at fixes: reproduce, compare with working code, one hypothesis at a time, then fix from the failing test. If two fixes have already failed, bring in `repertoire:advisor` before trying a third.
