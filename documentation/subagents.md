# Writing subagents

A subagent runs an assignment in a separate context with its own system prompt and tool set. Read [`authoring.md`](authoring.md) first. It covers choosing the mechanism, descriptions, verification, safety, and evals, which apply here too.

Subagents are written directly in `agents/<name>.md`: frontmatter plus a body that becomes the system prompt. Nothing builds them.

## The justification gate

A subagent costs a handoff, duplicated context, and a result someone has to reconcile and verify. Before writing one, complete this sentence:

> Compared with the parent applying the same skill, a separate worker materially helps because ___. The expected benefit can be checked by ___.

At least one of these must hold, with a task-specific explanation. Naming the reason isn't enough; name the actual information, workstream, configuration difference, or ownership boundary:

| Reason | Holds when |
| --- | --- |
| Context isolation | The worker consumes substantial intermediate material the parent doesn't need in full |
| Independent evaluation | The result benefits from excluding the implementer's reasoning or other influential information |
| Parallel work | The worker can make progress without waiting on another worker's unresolved decisions |
| Different configuration | The assignment needs a different model, tool set, or permission boundary |
| Separate ownership | The worker has stable interfaces, explicit file ownership, and independently verifiable acceptance conditions |
| Separate state | Persistent memory has a justified purpose, provenance, and freshness rules, and doesn't undermine an independent evaluation |

If none holds, write a skill. If one holds only sometimes, keep the method as a skill and delegate under a stated condition, such as "when the diff is over 500 lines".

## The definition is a contract, not a persona

A small contract beats a long persona (`TASK-C1`). The definition holds what's stable:

- **Purpose:** one coherent outcome, with explicit non-goals (`OWNERSHIP-1`).
- **Method:** the decisions and observations that lead to a defensible result, written like a skill's procedure. See [`skills.md`](skills.md#write-a-procedure-not-a-persona).
- **Authority boundary:** what it may and may not do.
- **Output shape:** see [Output](#output).
- **Stopping condition:** see [Stopping and budgets](#stopping-and-budgets).

Facts that change per task, such as commits, branches, paths, and the diff under review, arrive with each assignment and are never hardcoded (`TASK-C1`). Missing prerequisites lead to a bounded report of what's uncertain, or an escalation, not a guess (`TASK-3`).

## Description and delegation

- State the trigger, the deliverable, and when delegation is unnecessary, so small tasks stay in the main conversation (`DELEGATE-1` to `DELEGATE-3`).
- Keep it short and put the detail in the system prompt, which loads only when the subagent runs. Claude Code warns at startup when all custom subagent descriptions together exceed 15,000 tokens. **(lint: at most 1,024 characters)**

## Tools and permissions

- **Declare `tools` explicitly.** Omitting it inherits every tool available to subagents (`PERMISSION-C1`). **(lint)**
- Size the allowlist to the role. A reviewer that has `Bash` can write files, so a read-only worker gets `Read`, `Grep`, and `Glob` (`PERMISSION-1`, `PERMISSION-2`).
- `disallowedTools` is a denylist applied before the allowlist. An entry with a pattern, such as `Bash(git push *)`, still removes the whole tool.
- **Plugin subagents ignore `hooks`, `mcpServers`, and `permissionMode`.** Ship hooks in `hooks/hooks.json` and MCP servers in `.mcp.json`, which apply plugin-wide, and scope the agent with `tools` instead. **(lint)**
- Read-only comes from the tool allowlist, never from prose. "Do not edit" on a worker with every tool is no protection (`PERMISSION-C1`).
- Destructive or externally visible actions need explicit authorization (`PERMISSION-4`). Untrusted repository text, logs, and fetched documents can't override the assignment (`PERMISSION-5`).

Plugin subagents support these fields: `name`, `description`, `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, `skills`, `memory`, `background`, and `isolation`.

## Context

A subagent starts fresh. It doesn't see the conversation, skills already invoked, or files already read. It does get its system prompt, the task message, `CLAUDE.md`, git status, and skills preloaded through its `skills` field. The delegating prompt must carry everything else.

- Select inputs deliberately rather than copying the conversation wholesale (`ISOLATION-1`).
- Large investigations come back as compact conclusions with locators for the evidence (`ISOLATION-2`).
- For independent review, withhold the implementer's reasoning and conclusions. Work from the requirements and the raw artifacts (`ISOLATION-3`).
- Investigators look for counterevidence as well as support, and reviewers may report zero findings (`INDEPENDENCE-1`, `INDEPENDENCE-2`).

## Output

- Organize the output around the parent's next decision (`HANDOFF-1`).
- Each conclusion carries compact evidence: files, symbols, lines, revisions, tests, or logs (`HANDOFF-2`, `EVIDENCE-1`).
- Keep observed facts, inferences, and unverified claims apart (`EVIDENCE-2`). Negative claims state what was covered (`EVIDENCE-4`).
- Report status accurately: complete, partial, blocked, or escalated (`HANDOFF-4`).
- Allow three honest outcomes: supported findings, no supported findings, or not enough evidence. **Never demand a number of findings** (`HANDOFF-C1`).

## Stopping and budgets

- Completion means answering the assigned question to a stated standard (`STOPPING-1`).
- The worker stops at a budget, a missing prerequisite, or a material change of scope, and escalates with the evidence it has and the smallest useful next step (`STOPPING-2`, `STOPPING-4`).
- Set `maxTurns` to bound runaway work (`MODEL-2`).
- Choose the model by difficulty and the cost of errors, not by job title (`MODEL-1`).

## Parallel work

- Parallel assignments have stable inputs and few hard dependencies (`PARALLEL-1`).
- Concurrent writers have explicit file ownership and isolated checkouts, such as `isolation: worktree` (`PARALLEL-2`).
- Shared resources such as ports, databases, caches, and generated files are namespaced or coordinated (`PARALLEL-3`).
- The combined result is verified after integration (`PARALLEL-4`).

## The parent's responsibilities

The parent conversation, or the skill that dispatches the worker, owns the result:

- It weighs findings rather than accepting them automatically (`PARENT-1`).
- It resolves contradictions with evidence or another test, not a vote (`PARENT-2`).
- It records why findings were accepted or rejected (`PARENT-3`).
- It verifies the combined result and reports what remains uncertain (`PARENT-4`).

## Delegation contract

Use this shape for the prompt a skill or the parent sends to a worker:

```text
Assignment:
[One bounded question or outcome.]

Why separate execution helps:
[Context compression, independent evaluation, parallel work,
configuration difference, or separable ownership.]

Inputs and revisions:
[Requirements, repository revision, target diff, relevant artifacts.]

Scope and non-goals:
[What to inspect or change; what remains out of scope.]

Allowed actions and effective controls:
[Permitted tools, files, commands, resources, and authorizations.]

Information boundary:
[What must not be supplied or made accessible, when relevant.]

Expected output:
[Conclusion, evidence, counterevidence, coverage, uncertainties,
changes, verification results, and artifact locations.]

Stopping condition and budget:
[Completion threshold, resource limit, and blocked/escalation path.]

Parent responsibility:
[Who evaluates the result, owns integration, and verifies completion.]
```

## Subagent checklist

- [ ] The justification sentence is complete, with a task-specific reason.
- [ ] The description states a trigger, a deliverable, and when not to delegate.
- [ ] The definition is a compact contract, with per-task facts left as inputs.
- [ ] `tools` is an explicit allowlist sized to the role, and read-only is enforced by it.
- [ ] No `hooks`, `mcpServers`, or `permissionMode`.
- [ ] The output has evidence per item, a status, and an explicit no-findings path.
- [ ] Stopping rules, `maxTurns`, and the model are chosen on purpose.
- [ ] The parent, or the dispatching skill, reconciles and verifies the result.
- [ ] `bun run lint` passes.
