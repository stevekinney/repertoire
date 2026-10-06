# Patterns for keeping context useful

Every session starts from nothing. Whatever the agent learned yesterday (how the build works, which approach already failed, the convention you corrected twice) is gone unless something put it where today's session will find it. These three patterns decide what gets written down, where it lives, and how the setup gets smarter instead of starting over. They work at different timescales: the testing contract holds the handful of facts every session needs, the progress file carries one long task across sessions, and compound engineering carries lessons across tasks. Write down less than you think, keep it accurate, and put it where the next session will actually look.

## Instructions as a testing contract

**What it is:** Put the exact build and test commands, in order, with what passing looks like, into the instructions file the agent reads at the start of every session.

**How it works:** This has the strongest evidence of any of the fifteen patterns. Ten months of GitHub's coding agent on `dotnet/runtime` measured pull request success at 38.1% before setup changes and 69% after, and the main change was writing down which commands to run, in what order, and what to expect. The engineers had assumed the agent would figure out the build. It guessed, and each wrong guess cost a full failed CI run. That is why these commands outrank everything else in `CLAUDE.md` or `AGENTS.md`: a missed style preference costs a review comment; a wrong build command costs a failed run plus a recovery attempt that may guess wrong again. (Two caveats on the number: the team also added network access to package feeds at the same time, and it is one repository with an unusually complicated build.)

**When to use it:** On any repository whose build isn't one obvious command, which is most real ones, and especially monorepos or anything whose fast inner-loop build differs from the full one. Start the moment you see the agent run the wrong thing twice; that repetition doesn't fix itself.

**When not to use it:** To document the whole build system. Instruction files have a budget, and a long one gets skimmed. Never write a command you haven't verified: a wrong command is worse than none, because the agent trusts it and stops thinking. Keep fast-changing details out, since a stale command fails confidently. And if the commands belong in a script or task runner, put them there and point to it.

**Implemented by:** `project-initializer` writes the verified build and test commands into the instructions file with what passing looks like, while the user watches, as part of setting a repository up for agent work. On an existing repository, the same rule applies without the skill: run each command, confirm its output, and only then write it down.

## Progress file

**What it is:** One append-only file that records what was done, what was tried and failed, and what comes next. Each session reads it first and updates it last.

**How it works:** Every session starts by reading the progress notes and the git log and running a basic smoke test before touching anything, does one piece of work, and ends by appending what it did. The failures are the most valuable part. A file that only lists completed work is a worse changelog than git already keeps; the useful version records dead ends with the reason ("tried moving the query into the parent component; it broke the suspense boundary, reverted"). Without that, every fresh session rediscovers the same dead end, which is the most common way long runs waste money. Keep it append-only: an agent allowed to rewrite it will eventually summarize the failures away, because keeping the successes is what a summary does.

**When to use it:** Whenever work outgrows one session's context window: overnight runs, multi-day features, any Ralph loop where each pass starts blind. Also when several sessions or agents touch the same work, so there is one story instead of a pile of transcripts.

**When not to use it:** For a task that fits in one session, where it's overhead that goes stale the moment you stop maintaining it. Don't use it in place of commits; git already records what changed. Keep it separate from the plan, since a file that mixes intent with history leaves you guessing which lines are still true. Rotate it before it grows so large that reading it eats the context it was meant to save.

**Implemented by:** `session-handoff` writes the entry: what got done, what is verified and how, what is half-finished, what was tried and abandoned and why, and the one next step, each stamped with when it was last verified. It discovers the project's handoff location first and replaces its own block on rerun. `project-initializer` creates the file in the first place. `/repertoire:worktree-swarm` writes its own machine handoff, so don't run `session-handoff` on top of it.

## Compound engineering

**What it is:** End every task by writing down what it taught you, in a place the next task will read. Plan, work, review, then compound.

**How it works:** The first three steps are ordinary; the fourth is the point. After review, look at what made the change hard: the framework quirk, the convention you had to correct, the approach that failed. Write it as a rule in `CLAUDE.md`, a note in the project docs, or an edit to a skill, so the next task's planning step starts out knowing what the last one had to learn. A good lesson is specific and findable. "Be careful with dates" helps nobody. "Our API returns timestamps in UTC without a `Z` suffix; parse with `parseUtc()` in `lib/time.ts`" saves the next session an hour.

**When to use it:** On a long-lived codebase with the same small team, where the same kinds of mistake keep coming back. A written lesson pays off every time the mistake doesn't recur, and it is the most direct way to turn repeated corrections into something durable.

**When not to use it:** On throwaway projects, where there is nothing to compound. On very large codebases with many teams, lessons pile up faster than anyone prunes them, and an always-loaded `CLAUDE.md` full of them costs the context it was meant to save; there, put lessons where they load on demand, in a skill or a docs folder the agent searches. And don't let the agent decide on its own what gets written. Review lessons like code.

**Implemented by:** `repertoire:self-improvement-junkie` drafts the lesson from the task's evidence (the diff, review findings, failed approaches, corrections) as a proposed `CLAUDE.md` rule, docs note, or skill edit with the evidence behind each line; you decide what lands. When a lesson is big enough to be a whole procedure, `skill-builder` writes it as a skill and proves it changes behavior against a baseline, then `/repertoire:optimize-component` audits the result against the authoring guides.
