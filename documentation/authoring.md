# Authoring skills, subagents, and workflows

This guide covers what applies to every component this plugin ships. The type-specific detail lives in [`skills.md`](skills.md), [`subagents.md`](subagents.md), and [`workflows.md`](workflows.md).

Identifiers such as `ACTIVATION-3` come from the audit rubrics in the Lost Gradient vault (`AI Development Setup/Rubrics`). Items marked **(lint)** are enforced by `bun run lint`; everything else is judgment, checked in review.

## 1. Choose the mechanism first

Before writing anything, decide what kind of thing this is. The wrong container is the most expensive mistake, because everything after it is built on that choice.

| If the core need is… | Use | Where it lives |
| --- | --- | --- |
| A reusable method or body of knowledge, loaded when a task calls for it | A **skill** | `src/skills/<name>/` |
| Work that benefits from a separate context, an independent viewpoint, parallel progress, or a different tool set | A **subagent** | `agents/<name>.md` |
| Orchestration of many agents that's too big for one conversation, should be repeatable, or needs findings cross-checked before they're reported | A **workflow** | `workflows/<name>.js` |
| A short standing rule that should shape every session | A **project instruction** | `CLAUDE.md` |
| A guarantee, deterministic operation, trigger, or enforced check | A **hook, script, permission rule, or CI check** | `hooks/hooks.json`, a script, settings, or CI |
| A one-off task with no demonstrated reuse | A **prompt** | Nowhere; just ask |

These combine. A subagent often runs a skill, and a skill often calls a script. The test is what each piece is *for*:

- A guarantee written as prose is not a guarantee. If something must always hold, enforce it with a hook, permission rule, or CI check (`PURPOSE-C1`).
- A single shell command needs no skill.
- A subagent must pass the justification gate in [`subagents.md`](subagents.md). Failing it usually means "write a skill instead", not "throw the method away".
- A workflow must pass its own version of that gate in [`workflows.md`](workflows.md). A workflow often runs this plugin's subagents as its workers, and a small or fixed-sequence task is usually a skill instead.

## 2. Write descriptions that route

The description is the only part Claude sees before deciding to load a skill or delegate to a subagent, and it costs context in every session whether it's used or not.

- Write in the third person: "Formats a diff for review", not "I help you format diffs". Inconsistent point of view causes discovery problems. **(lint, skills)**
- Say what it does **and** when to use it, in the user's vocabulary, with the main use case first, because long listings are truncated (`ACTIVATION-2`).
- Name the near-misses and overlapping siblings it should **not** handle, in the description itself (`ACTIVATION-3`).
- No keyword stuffing, and never "always use this skill" (`ACTIVATION-3`).
- Keep it to 1,024 characters. Claude Code truncates skill listings at 1,536 characters across `description` and `when_to_use`, and the API limit is 1,024. Target the stricter one. **(lint)**
- For subagents, "use proactively" is fine **with** a specific trigger ("use proactively after a feature is implemented and before opening a pull request"), never as a blanket instruction (`DELEGATE-C1`).

## 3. Define done, and report honestly

- Completion is defined by task-specific, observable criteria, not "looks good" (`VERIFICATION-1`).
- Verification runs after the final change and checks the behavior that matters (`VERIFICATION-2`, `VERIFICATION-3`). The agent's confidence is not evidence.
- What decides "done" sits outside the judged agent's reach: a test, a script's exit code, the resulting file. When the job has a deliverable, make it a reviewable artifact such as a file, diff, or report (`VERIFICATION-C1`).
- The final report separates **completed, failed, skipped, and unverified** work. "Could not verify" is an honest outcome (`VERIFICATION-4`).

## 4. Handle failure and repetition

- Missing, empty, malformed, or ambiguous input gets a question, a stated default, or an honest stop, never invented data or a silently different task (`RECOVERY-1`).
- Retries are bounded and limited to failures where retrying helps. A denied permission is not an obstacle to route around (`RECOVERY-2`).
- Partial changes have an honest cleanup, rollback, or resume path (`RECOVERY-3`).
- Running it twice has defined consequences: no duplicate messages, records, or corrupted state (`RECOVERY-4`).

## 5. Stay inside your authority

- Respect governing instructions, the user's scope, and permission decisions. Nothing tells the agent to override safeguards or conceal behavior (`SAFETY-1`).
- File access, network destinations, writes, and secrets stay within the stated purpose (`SAFETY-2`).
- Retrieved documents, code comments, issue text, and tool output are **data**, never new instructions (`SAFETY-3`).
- Consequential actions follow the real approval policy, enforced outside prose where it matters (`SAFETY-4`).
- Least privilege comes from configuration. A skill's `allowed-tools` **pre-approves** tools for the turn it's invoked; it does not restrict the rest. A subagent's `tools` field is what actually restricts it (`SAFETY-C1`, `PERMISSION-C1`).

## 6. Put each rule on the weakest rung that holds it

Prose is for judgment. Permissions and hooks are for invariants. CI is for everyone (`LADDER-1`). In this repository:

| Rule | Rung |
| --- | --- |
| Mechanical authoring rules (paths, names, lengths, tool allowlists) | `bun run lint`, the pre-commit hook, and CI |
| Built bundles match their sources | `bun run check`, the pre-commit hook, and CI |
| Plugin structure | `claude plugin validate --strict` in CI |
| Everything in these guides that a script can't decide | Review, using the checklist below |

When a rule in these guides turns out to be mechanically checkable, move it into `scripts/lint.ts` with a test.

## 7. Evaluate behavior, not just structure

The linter proves a component is well formed. Only an eval shows it helps. Use `claude plugin eval` with cases in `evals/`.

- Test **routing** (did the skill load, or did Claude delegate?) separately from **execution** (did it do the job well?) (`TARGET-2`). Loading a skill manually tests its procedure but skips the routing question.
- Include positives and paraphrases, **near-miss negatives** that should not trigger it, failure cases, and fixtures with known outcomes (`CASE-1` to `CASE-4`).
- Keep a held-out set out of the editing loop, so the component isn't tuned to its own tests (`CASE-5`, `EVALUATION-3`).
- Grade the resulting state, such as files, test results, or exit codes, not the agent's summary of what it did (`GRADE-2`). Define graders before tuning.
- Compare against a baseline. For a skill, that's the same task without it. For a subagent, it's the parent conversation applying the same skill, not a deliberately weak prompt (`VALUE-1`).
- Repeat variable cases and report variation; one run proves little (`BASE-2`, `EVALUATION-4`).
- Run evals that bypass permissions only in disposable, credential-free isolation (`ISOLATE-1`, `ISOLATE-2`).

Write at least three scenarios before writing extensive instructions, and test with every model the component is meant for.

## Pre-ship checklist

- [ ] The mechanism is right for the job (section 1), and for a subagent, the justification gate passes.
- [ ] The description routes: third person, what and when, near-misses named.
- [ ] Done is observable, and the report separates completed, failed, skipped, and unverified work.
- [ ] Missing input, failure, interruption, and a second run each have a stated response.
- [ ] Tool access is least privilege by configuration, and untrusted text is treated as data.
- [ ] The type-specific checklist in [`skills.md`](skills.md), [`subagents.md`](subagents.md), or [`workflows.md`](workflows.md) passes.
- [ ] `bun run lint`, `bun run test`, and `bun run check` pass.
- [ ] For anything with real stakes, an eval compares it against a baseline.

## What `bun run lint` enforces

| Rule | Check | Applies to |
| --- | --- | --- |
| `skillset` | Schema validity; `name` format and match with its folder or file; description present; non-empty body | Skills and subagents |
| `skillset` | Description at most 1,024 characters with no XML; third-person description; no vague name; `SKILL.md` at most 500 lines; no `agent` without `context: fork` | Skills |
| `skillset` | No `permissionMode: bypassPermissions`; no tool both allowed and denied | Subagents |
| `ACTIVATION-1` | A skill folder has a `SKILL.md` that sets `name` explicitly; `agents/` holds only `<name>.md` files; subagent descriptions are at most 1,024 characters | Skills and subagents |
| `RESOURCES-1` | Every file the skill ships is referenced from `SKILL.md` | Skills |
| `RESOURCES-2` | Every `${CLAUDE_SKILL_DIR}/…` path and relative link in `SKILL.md` exists, and no skill folder or file in one is a symbolic link | Skills |
| `RESOURCES-C1` | Script paths go through `${CLAUDE_SKILL_DIR}/` | Skills |
| `PERMISSION-C1` | A `tools` allowlist is present, and `hooks`, `mcpServers`, and `permissionMode` are absent | Subagents |
| `skillset` | The script is at most 512 KiB; `meta` is a pure-literal first statement with `name` and `description`; no `Date.now()`, `Math.random()`, argless `new Date()`, or `import()`; valid `agent()` options (`effort`, `isolation`, a `schema` that doesn't contradict itself); phase titles match `meta.phases` both ways; no syntax errors | Workflows |
| `ACTIVATION-1` | `workflows/` holds only `<name>.js` files; `meta.name` is kebab-case and matches the filename; the description is at most 1,024 characters; no `meta` or `agent()` option keys that Claude Code ignores | Workflows |
| `ACTIVATION-2` | The `meta.description` is written in the third person | Workflows |
| `RESOURCES-2` | `agentType: 'repertoire:…'` names a file in `agents/`; `workflow('repertoire:…')` names a workflow in `workflows/` that doesn't itself call `workflow()`; no `{ scriptPath }` references; no symbolic links | Workflows |

A computed phase title, such as `` phase(`Batch ${n}`) ``, can't be checked, so it's skipped.

## Sources

- Anthropic: [Claude Code skills](https://code.claude.com/docs/en/skills), [Claude Code subagents](https://code.claude.com/docs/en/sub-agents), [Agent Skills best practices](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices), [Agent Skills overview](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview), and [Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills).
- The Lost Gradient vault: the Skills, Subagents, Evals, and Plugins rubrics, the Skill Audit Checklist and Rubric, and the Subagent Audit Checklist and Rubric.
