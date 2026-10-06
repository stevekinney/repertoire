# Patterns for running unattended work

Everything gets riskier when you stop watching. Nobody notices the agent going in circles, catches the destructive command, or sees the bill climbing. These four patterns let you walk away anyway: a loop shape that survives long runs, a limit the agent can't argue with, a short list of decisions that still need you, and a way to run several agents without them tripping over each other. They assume the proving-it-works patterns are in place; an unattended loop with a weak "done" check produces confident, wrong work faster. Unattended work trades watching for limits, gates, and evidence you can check later. When any one of the three is missing, you aren't running unattended work. You're just not looking.

## Ralph loop

**What it is:** Start a fresh agent, give it one small task, keep all progress on disk, check the result, and repeat until an outside check says the work is finished or the budget runs out.

**How it works:** Each pass is a brand-new agent that reads its state from files, does one item, and exits, so nothing rots across passes. The cost is that reasoning disappears unless someone writes it down, which is why it pairs with a progress file (see `keeping-context-useful.md`). The outside check is the stop signal, never the agent's own report.

**When to use it:** For work with a machine-checkable finish line that splits into many small pieces: a migration from one test framework to another, a coverage push, porting, a backlog of well-specified features on a new codebase. It is the natural shape for overnight runs once you have tuned the prompt by watching a few passes yourself.

**When not to use it:** When no command can tell you it's done. Judgment calls, unclear success criteria, and production debugging don't belong in a loop. Be wary of mature codebases full of unwritten conventions, where fast generation mostly generates review work. And never point it at anything irreversible, like production infrastructure, deploys, or data. A loop runs your worst iteration as confidently as your best.

**Implemented by:** `ralph-loop` scaffolds the loop itself: the oracle first, then the limits and the log, then the loop. `project-initializer` sets up what each pass reads first: the verified commands, a feature list where every item starts failing, the progress file, and a baseline commit. `session-handoff` writes the entry each pass leaves behind. When the outside check needs judgment, `repertoire:referee` rules on the stopping condition at the end of each pass from the evidence, never the transcript. The loop runner itself (the shell loop or plugin that starts each fresh pass) is a mechanism outside this plugin; name it in the hand-off and treat it as unverified until it exists.

## Circuit breaker

**What it is:** Bound every loop by something the agent doesn't control: a number of iterations, a dollar amount, a time limit, or a lack of progress.

**How it works:** Four kinds, which fail differently, so serious setups use more than one.

- **Count:** stop after _n_ iterations or turns. The simplest and most important; Anthropic's Ralph plugin calls its `--max-iterations` the primary safety mechanism, ahead of the completion check.
- **Spend:** stop at a dollar limit. Iterations vary wildly in cost, so a count doesn't bound the bill. In Claude Code, `--max-budget-usd` caps a single `claude -p` run.
- **Time:** stop at a wall-clock limit. It matters when the loop shares a machine or a deadline.
- **Stall:** stop when a progress measure (failing tests remaining, features left) stops improving. The least common and the most useful, because on an impossible task it fires long before the count limit.

Whichever fires, the loop has to say which. "Finished," "ran out of turns," and "ran out of money" call for three different responses, and a bare exit code can't tell them apart.

**When to use it:** On every unattended loop. Any loop can meet a task the model can't solve, and you won't know in advance which. Add a spend limit whenever subagents are involved: a count on the parent says nothing about how many subagents it starts.

**When not to use it:** Leaving it out isn't the risk; setting it wrong is. A limit that's too low turns a solvable task into a false failure, and trains you to raise limits on reflex until they stop meaning anything. Raise a limit only after you've worked out why the run hit it. "It needed more iterations" isn't a reason.

**Implemented by:** No repertoire component. The limits live in the runner's flags and in a stall check the runner computes from the progress measure. Report which kind fired alongside the result. Until the limit is set outside the agent's reach, the hand-off is unverified.

## Human-gated autonomy

**What it is:** Put people at the few decisions that are hard to undo, and let permissions and a sandbox handle everything else.

**How it works:** If every action asks for approval, you stop reading the prompts and start clicking yes, which is worse than no gate because it looks like oversight. Pick the gates deliberately. There are usually three: **intent** (what are we doing and what's out of scope; this is where interview to spec lives), **plan** (is this the right approach; plan mode blocks edits until you approve), and **irreversible action** (merge, deploy, delete, send, pay; anything that leaves your machine or can't be taken back). Between the gates, the agent works inside a boundary that machinery enforces: permission rules, the sandbox, and hooks. Put each gate where you can see the actual consequences. Approving a prepared migration with the SQL in front of you is a real decision; approving "I'll update the database" is a guess.

**When to use it:** Whenever the agent runs long enough that you wouldn't read every prompt anyway, which is most real work. It matters more with several agents, where per-action prompts multiply. The merge gate is mandatory for anything irreversible or external, however much you trust the run.

**When not to use it:** As a replacement for a sandbox on a machine with production credentials lying around. An approval policy trusts the agent's own description of what it's about to do, and a prompt injection (instructions hidden in a file or page the agent reads and follows) can make that description a lie. Skip the plan gate for one-line changes. Watch for gates that have gone automatic: a gate you approve without reading is just a delay.

**Implemented by:** Permission rules, the sandbox, and hooks hold the boundary; a gate written only in prose is a delay, not a gate. When the agent must read something untrusted (an issue, a web page, a third-party README), `repertoire:bookworm`, which has no tools that act, pulls out the named fields first. At the plan gate, `repertoire:junior-engineer` reports what the plan leaves the agent to guess; `interview-to-spec` is the intent gate. Three examples of a gate placed well: `commit-and-pr-author` prepares commits and the pull request description but never pushes or opens the pull request unless asked, `integrator` merges worker branches with full checks after each and ends at a menu without touching the base, and `pr-shepherd` handles CI, conflicts, and review comments and stops at "ready to merge".

## Parallel worktree swarm

**What it is:** Give each agent its own worktree and branch, so several can work at once without tangling their edits, then integrate the results one at a time.

**How it works:** Split the work by ownership before starting any agents, give each piece its own checkout, and integrate the branches serially with the full checks after each merge, because branches that pass alone can fail together and only serial integration shows which one broke what. The same setup runs best-of-N: several attempts at one hard problem, with the tests or a judge picking the winner.

**When to use it:** When the work splits along clean file boundaries: separate modules, separate layers, mechanical changes repeated across many files. The tell is whether you can write down who owns what before you start. If you can, the branches will probably merge cleanly.

**When not to use it:** For coupled work, where one piece needs something another creates; do those in order. Worktrees only isolate files, so agents still share the database, the dev server's port, and the caches, and one agent's migration can break another's tests. Don't run more agents than you can review, because review is where the time goes. And mind the quota: parallel agents burn through a subscription in proportion to how many you run.

**Implemented by:** `/repertoire:worktree-swarm` runs one `repertoire:line-cook` per task in its own worktree, with `repertoire:junior-engineer` checking every brief before work starts and `repertoire:referee` ruling on every result, and ends in a handoff for `integrator`, which merges the branches one at a time in dependency order and stops at the first conflict or failure. `repertoire:scrumlord` turns the approved plan into one ticket per worker with scope, dependencies, and acceptance criteria. For best-of-N, `repertoire:judge` ranks the attempts against criteria fixed before any candidate was seen. To run the whole thing from one place, start `repertoire:orchestrator` with `claude --agent repertoire:orchestrator`; it hands off to the integrator when the line cooks are done.
