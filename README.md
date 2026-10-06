# Repertoire

My skills and workflows for AI-assisted software development, packaged as a [Claude Code](https://docs.claude.com/en/docs/claude-code) plugin.

## Installation

This repository is both the plugin and a single-plugin marketplace. In Claude Code:

```text
/plugin marketplace add stevekinney/repertoire
/plugin install repertoire@repertoire
```

## What's in it

Skills are namespaced as `repertoire:<skill>`, subagents as `repertoire:<agent>`, and workflows as `/repertoire:<workflow>`. The guides in [`documentation/`](documentation/authoring.md) explain the rules each one was written to, and `/repertoire:optimize-component` audits them against those rules.

### Skills

| Skill | What it does |
| --- | --- |
| `agentic-coding-patterns` | Routes a recurring failure with coding agents, or a task about to start, to one of fifteen patterns, checks the pattern's reasons not to use it, and names the repertoire component or mechanism that implements it. |
| `browser-check` | Checks the agent's own UI work in a real browser by starting the app locally, writing short Playwright scripts that look before they act, reading the console, and fixing what it finds in the same session. |
| `commit-and-pr-author` | Turns a session's changes into a reviewable history. |
| `consult-codex` | Gets a second opinion from OpenAI Codex by running one read-only, ephemeral `codex exec` and verifying its claims against the source before reporting them. |
| `debugging-protocol` | Stops the agent from guessing at fixes. |
| `delegation-brief` | Makes the main agent write a full brief before every Agent or Workflow call: the bounded assignment, inputs and revision, owned paths, allowed actions, what is withheld by role, the output shape with permission to return nothing, and the stopping condition; one brief per independent problem when fanning out. |
| `integrator` (manual-only) | Merges worker branches one at a time, in dependency order, onto an integration branch, running the full checks after each merge. |
| `interview-to-spec` | Turns a vague feature request into a self-contained SPEC.md. |
| `plan-writer` | Writes research.md and plan.md for a task, stopping for the user's review after each. |
| `pr-shepherd` | Takes an open pull request from opened to ready to merge. |
| `project-initializer` (manual-only) | Sets up a repository for agent-driven work, once, before any feature is written: a start script, an end-to-end smoke check, the verified build and test commands in CLAUDE.md with what passing looks like, a feature list where every item starts failing, a progress file, and one baseline commit. |
| `ralph-loop` (manual-only) | Scaffolds a Ralph loop into the user's project, with a fresh `claude -p` agent per task, progress on disk, and a script that measures, picks, accepts, and stops. |
| `sentinels` | Designs and operates sentinels, markers whose presence ends a loop or unlocks an action, such as "this exact diff was reviewed". |
| `session-handoff` | Writes the handoff the next session needs before this one ends, is compacted, or is cleared. |
| `skill-builder` | Writes a new skill, or improves an existing one, and proves it changes behavior. |
| `taking-review-feedback` | Triages review feedback before acting on it. |
| `test-first-loop` | Enforces red, green, refactor. |
| `ticket-dossier` | Builds a dossier for a ticket before work starts. |
| `verification-gate` | Stops the agent from claiming work is done, fixed, or passing until it has fresh evidence. |

### Subagents

| Subagent | What it does | Tools |
| --- | --- | --- |
| `repertoire:advisor` | Gives a second opinion, from a stronger model, on a decision the parent has not made yet. | `Read, Grep, Glob` |
| `repertoire:antagonist` | Hunts for concrete flaws in finished work, either a diff about to merge or a claim the parent is about to build on ("nothing else calls this"). | `Read, Grep, Glob, Bash` |
| `repertoire:archaeologist` | Reviews a finished change as a maintainer would six months from now, with the author gone, and reports what the code, comments, tests, and commit messages leave unexplained, so the author can write it down now. | `Read, Grep, Glob` |
| `repertoire:bookworm` | Reads untrusted content (a public issue, a web page, a third-party README, a customer's bug report) and returns only the fields the assignment names, each with a verbatim quote and a locator. | `Read, WebFetch` |
| `repertoire:conspiracy-theorist` | Tests one debugging hypothesis against a reproduced bug and returns a verdict (confirmed, ruled out, or inconclusive) with the commands, files, lines, and output behind it, plus any evidence pointing at a different cause. | `Read, Grep, Glob, Bash` |
| `repertoire:judge` | Ranks several finished attempts at the same task (competing fixes, rival designs, the same change in several worktrees, rival bug explanations) against criteria fixed before any candidate was seen. | `Read, Grep, Glob, Bash` |
| `repertoire:junior-engineer` | Reads a plan, ticket, or task before work starts and reports every place an implementer would have to guess. | `Read, Grep, Glob` |
| `repertoire:line-cook` | Builds one bounded task from a written plan in its own worktree, and nothing else. | `Read, Grep, Glob, Bash, Edit, Write` |
| `repertoire:new-hire` | Audits a public interface (SDK, CLI, API, or component library) by attempting a realistic task with only the public surface and its docs, and reports where it got stuck, guessed, or assumed. | `Read, Grep, Glob, Bash` |
| `repertoire:orchestrator` | Runs a long, multi-step session by delegation alone, started with `claude --agent repertoire:orchestrator`. | `Agent(junior-engineer, scout, line-cook, referee, test-designer, scrumlord), Workflow, Read, TaskCreate, TaskUpdate, TaskList, AskUserQuestion` |
| `repertoire:reenactor` | Turns a bug report, red CI run, or production error into the smallest test that fails for the reported reason, plus the command that runs it and ranked suspect files and lines, before anyone writes a fix. | `Read, Grep, Glob, Bash, Edit, Write` |
| `repertoire:referee` | Decides whether a stopping condition written before the work has been met, judging from evidence (test output, the diff, screenshots) and never the transcript. | `Read, Grep, Glob, Bash` |
| `repertoire:saboteur` | Makes a task's checks pass without doing the work, in a disposable worktree, to find the holes an implementing agent could fall through. | `Read, Grep, Glob, Bash, Edit, Write` |
| `repertoire:scout` | Maps a task's territory before implementation and returns the files that matter (path and line), the conventions to follow, the helpers and tests that already exist, and anything surprising, each with a locator; the grepping and dead ends stay in its own context. | `Read, Grep, Glob` |
| `repertoire:scrumlord` | Keeps the issue tracker and the codebase telling the same story. | `Read, Grep, Glob` |
| `repertoire:self-improvement-junkie` | Drafts what a project's setup should learn from a hard task. | `Read, Grep, Glob` |
| `repertoire:stickler` | Audits an implementation against written requirements clause by clause and reports each obligation as satisfied (with file and line evidence), unsatisfied, or unverifiable. | `Read, Grep, Glob` |
| `repertoire:test-designer` | Derives tests, or the behaviors tests must cover, from written requirements and a public interface without seeing the implementation, so tests check what was asked for, not what was built. | `Read, Grep, Glob, Write, Edit` |

### Workflows

| Workflow | What it does |
| --- | --- |
| `/repertoire:localize-fault` | Turns a bug report into a minimal failing test, then tests each plausible cause in parallel and ranks them with evidence, so the fix starts with proof of the bug and a short list of suspects. |
| `/repertoire:optimize-component` | Audits skills, subagents, and workflows in this plugin against the guides in documentation/, verifies every finding adversarially, and rewrites each file in place. |
| `/repertoire:review-change` | Reviews a change with fresh-context reviewers, one per lens, verifies every finding adversarially, audits the change against its requirements clause by clause when they are given, and returns one ranked report. |
| `/repertoire:worktree-swarm` | Runs a set of independent, pre-partitioned tasks in parallel, one line cook per task in its own worktree, with a junior engineer checking every brief before any work starts and a referee ruling on every result. |

## Development

Skills are written in `src/skills/`, subagents in `agents/`, and workflows in `workflows/`. The guides in [`documentation/`](documentation/authoring.md) cover how to write each one.

Running `bun run build` generates `skills/` from `src/skills/`: TypeScript scripts become self-contained Node bundles with their npm dependencies inlined, and everything else is copied as is. `skills/` is committed because installing the plugin doesn't run a build. Don't edit it by hand.

`bun run lint` checks skills, subagents, and workflows with [`@lostgradient/skillset`](https://github.com/stevekinney/skillset)'s validators plus this plugin's own rules, and the build refuses to run when it fails.

`bun install` also installs a [Lefthook](https://lefthook.dev) pre-commit hook. It type-checks, tests, lints, rebuilds `skills/`, and stages the result, so the bundles on GitHub always match the source. CI runs the same checks on every push and pull request.

```sh
bun install        # also installs the pre-commit hook
bun run build      # lint, then regenerate skills/ from src/skills/
bun run check      # fail if skills/ is out of date
bun run lint       # check skills, subagents, and workflows
bun run test       # test the linter
bun run typecheck
bun run validate   # claude plugin validate --strict
```

Load the plugin straight from a checkout without installing it:

```sh
claude --plugin-dir .
```

## License

MIT
