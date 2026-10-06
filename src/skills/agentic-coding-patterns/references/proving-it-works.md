# Patterns for proving it works

The most common agent failure is not bad code. It is a completion claim with nothing behind it: in a study of 20,574 coding-agent sessions, unverified or partial work reported as done made up 22.58% of the episodes that went wrong, and that share grew as other problems shrank. These five patterns move the "done" decision out of the agent's head into something you can check. They stack: each closes a gap the previous one leaves open. Adopt the loop first; add the others after the first time a green check lies to you.

## Verification loop

**What it is:** Implement, run a check that produces pass-or-fail evidence, diagnose any failure, and go around again. The check decides when you are done, not the model.

**How it works:** Order the checks from cheap and narrow to expensive and broad: type check and lint in seconds, unit tests for local behavior, then integration or end-to-end checks that ask whether the feature works the way a person uses it. A failure at any layer goes back to diagnosis, not straight to another edit. The report of "done" carries the command, its exit code, and the relevant output, so the claim can be checked after the session ends. Anthropic's long-running harness found agents passing unit tests and `curl` checks while the feature was broken end to end; they improved only when told to test in a real browser.

**When to use it:** Any time "correct" can be written as a command: a failing test, a dependency upgrade the suite covers, a benchmark target. Every unattended run needs one; without it, the agent's feeling that the work looks done is the only stop signal.

**When not to use it:** When there is no mechanical oracle. "Make the dashboard look better" has no exit code, and a loop with no real signal spins or declares victory on its own say-so. Don't make a weak, agent-written suite the only gate. For a one-line change, skip the ladder and run the one test that matters.

**Implemented by:** Run the project's checks yourself, in the order the instructions file gives, and report each command with its exit code; `verification-gate` is the step where "done" has to arrive with that evidence. For anything a user sees in a web app, `browser-check` runs the app and looks. When the final check needs judgment instead of an exit code, hand the evidence to `repertoire:referee`, so the agent doing the work never decides it is finished.

## Test-driven agent loop

**What it is:** Write a test for the behavior you want, watch it fail, and only then let the agent implement. The test stays frozen while the agent makes it pass.

**How it works:** Red-green-refactor with one added rule: the agent must see the new test fail before writing the implementation. A test that passes before any code exists is not testing the new behavior. Once red, the test is frozen; the agent changes production code until green, then refactors while keeping it green. "Done" now means every behavior on the list was seen failing and now passes, and the test files still match what they were at the red step. A hook can enforce the frozen part by denying edits to test files during the green phase.

**When to use it:** When the behavior can be written as inputs and expected outputs before you know how to implement it: parsers, validators, API contracts, algorithms. It is also the best way to fix a bug: reproduce it in a failing test, fix it, and the test doubles as the regression guard.

**When not to use it:** When the tests already exist and the job is to make them pass; a study of agents on SWE-bench Verified found that pushing them to write more of their own tests didn't change outcomes and cost tokens. A poor fit when the spec is too vague to encode (UI polish, exploratory prototypes), and when the agent can't stand up the integration harness, because it will quietly swap in mocks so the tests pass.

**Implemented by:** `test-first-loop` runs this loop from the inside. `repertoire:test-designer` writes the tests from the requirements and the public interface without seeing the implementation, which is what keeps them honest when the same agent writes the code. For a bug, `repertoire:reenactor` produces the failing test and the command that runs it. The frozen-test rule is a hook on test-file edits, not a sentence in a prompt.

## Test ratchet

**What it is:** Quality measures move in one direction only. Tests can be added, never removed or weakened. Coverage can go up, never down.

**How it works:** Anthropic's harness states it flatly ("unacceptable to remove or edit tests") and backs it with a feature list where each entry has a `passes` field the agent may change and nothing else: the definition of done is fixed, and only the claim that it has been met is writable. Nothing enforces that on its own. To make it hold, add a hook that rejects edits touching anything but `passes`, or a script that validates the diff, or make a script the only thing allowed to flip `passes`. The same idea extends to anything with a direction (coverage, lint rules, suppression counts), each compared against the base branch rather than a fixed threshold.

**When to use it:** On every project where an agent can edit the files that judge it, which is nearly all of them. Especially on unattended runs, where nobody notices a weakened check for days, and anywhere "the suite is green" is the stop signal.

**When not to use it:** When a test is genuinely wrong. That is the real cost: a ratchet turns fixing a bad test into a separate, human-approved change instead of something the agent does mid-task. Don't ratchet a measure with no meaningful direction; a ratchet on test count rewards trivial tests. And don't rely on an instruction alone: block edits to `tests/` and the agent's next move is to lower a threshold in a config file.

**Implemented by:** A hook, permission rule, or CI check; this is an invariant, so prose is the wrong rung. Before trusting the checks, point `repertoire:saboteur` at them with the oracle command and the passing condition; it reports every cheat that worked, with the diff, so you patch the holes before an implementing agent finds them. Run it again after patching.

## Mutation gate

**What it is:** Grade the agent's tests, not just its code. Deliberately break the lines a change touched, and require the suite to notice.

**How it works:** A mutation tool makes small defects one at a time (`>` becomes `>=`, `return x` becomes `return 0`, a call disappears) and runs the tests against each mutant. A test failing means the mutant is killed. Everything still passing means it survived, and you have a concrete fact: this line can be wrong and nothing will tell you. Agent-written tests need this: a study of 86,156 test files from agent-authored pull requests found 80.2% had weak or no explicit assertions. Two things make it practical: scope it to the diff (forty changed lines take seconds, a whole codebase takes hours) and report the survivors, not a score, because "changing `>=` to `>` on line 48 survived" names the missing assertion. Stryker, PIT, mutmut, and cargo-mutants do the mutating.

**When to use it:** When an agent writes its own tests, and when a green suite is a loop's stop signal, since a weak suite makes every loop stop early. It pays off most on logic-heavy code (pricing, permissions, parsing) where a surviving mutant is a bug waiting to happen.

**When not to use it:** Across the whole repository on every change; it's too slow and will be switched off within a week. Skip code with nothing meaningful to assert, like logging or generated code. Don't chase a score: some mutants don't change behavior, no test can kill them, and an agent told to hit 100% will write absurd tests trying.

**Implemented by:** No repertoire component. Discover whether the project already has a mutation tool; if so, run it scoped to the diff and feed the survivors back to the implementing agent as findings. If not, naming the tool and the diff scope is the hand-off, and it stays unverified until the tool is installed and wired into a check.

## Fresh-context reviewer

**What it is:** Hand the finished change to a reviewer that never saw the conversation that produced it.

**How it works:** The reviewer gets the requirements, the diff, the test results, and read access to the code, but never the implementer's reasoning, and it must return findings it can demonstrate: a triggering input, a location, an expected and an actual result.

**When to use it:** As a bounded extra check on changes that matter, especially when the implementation conversation was long or the tests leave important behavior unexamined. Give it a narrow question. "Does logout invalidate an in-flight token refresh?" gets a better answer than "find anything wrong."

**When not to use it:** As a replacement for executable checks. A reviewer's verdict is an opinion; the tests are evidence. Set a round limit before you start, because an agent asked for suggestions will always find another one. Trivial changes don't need a second session.

**Implemented by:** `/repertoire:review-change` runs fresh-context reviewers one lens at a time, verifies each finding adversarially, and audits against requirements when they are passed in. For a single run, `repertoire:antagonist` hunts concrete flaws with one optional lens; `repertoire:stickler` audits clause by clause against written requirements; `repertoire:archaeologist` reports what the change leaves unexplained for a maintainer six months out. When findings come back, the main agent runs `taking-review-feedback`: decide each one on its evidence in the main session rather than accepting all of them on reflex; a reviewer's list is input, not a to-do list.
