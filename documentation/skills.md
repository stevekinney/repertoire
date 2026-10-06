# Writing skills

A skill packages a reusable method or body of knowledge that Claude loads when a task calls for it. Read [`authoring.md`](authoring.md) first. It covers choosing the mechanism, descriptions, verification, safety, and evals, which apply here too.

Skills are written in `src/skills/<name>/` and built into `skills/<name>/`. Never edit `skills/` by hand.

## How a skill loads

Skills load in three levels, and each level is a cost to justify:

1. **Name and description:** always in context, about 100 tokens per skill, in every session whether the skill is used or not.
2. **The `SKILL.md` body:** loaded when the skill triggers, and it then stays in context for the rest of the conversation. Every line is a recurring cost. Aim for under 5,000 tokens.
3. **Bundled files:** references, scripts, and templates load only when Claude needs them. A script that runs puts only its output in context, not its source.

## Structure

```
src/skills/<name>/
  SKILL.md              # entry point: frontmatter plus instructions
  references/*.md       # detail loaded on demand
  scripts/*.ts          # entry points, bundled to scripts/*.mjs
  scripts/lib/*.ts      # helpers, bundled into the entry points that import them
  assets/               # templates and other files used as is
```

- `name` is kebab-case and matches the directory name. **(lint)**
- `SKILL.md` stays under 500 lines. Length is an investigation signal: a longer file needs a reason, usually detail that belongs in a reference file (`CONTEXT-C1`). **(lint)**
- Every file the skill ships is referenced from `SKILL.md` (`RESOURCES-1`). **(lint)** Nothing ships for ornament.

## Frontmatter and invocation

- `name` and `description` route the skill. Follow the description rules in [`authoring.md`](authoring.md#2-write-descriptions-that-route).
- `disable-model-invocation: true` makes a skill manual-only. Set it on purpose for skills that are expensive, destructive, or only make sense when someone asks by name. Manual-only is a legitimate policy, not a defect (`ACTIVATION-4`, `ACTIVATION-C1`).
- `allowed-tools` pre-approves tools for the turn the skill runs. Scope it as narrowly as the skill needs, for example `Bash(node ${CLAUDE_SKILL_DIR}/scripts/format.mjs *)` rather than all of `Bash`. It doesn't restrict other tools (`SAFETY-C1`).
- `agent` only takes effect with `context: fork`. **(lint)**

## Write a procedure, not a persona

- A coherent job with explicit boundaries and non-goals. Not "expert engineer" (`PURPOSE-1`, `PURPOSE-3`).
- Required inputs, prerequisites, and whether the skill only reads or also modifies are stated. No reliance on an earlier conversation or an unexplained local directory (`PURPOSE-4`).
- Guidance connects observations to decisions and actions. A reference skill says how to choose and apply its knowledge, not just what the knowledge is (`PROCEDURE-1`).
- Important branches have decision criteria and a sensible default (`PROCEDURE-2`).
- Freedom matches fragility: exact steps for risky or fragile operations, discretion where several approaches are valid (`PROCEDURE-3`).
- Stopping rules say when to continue, finish, stop, or ask for a decision only the user can make (`PROCEDURE-4`).
- Every line changes a decision. Non-obvious rules carry a one-line reason. Examples show the normal case **and** the most common false success. Sample identifiers are labeled as samples. Capital letters alone don't change behavior (`PROCEDURE-C1`).
- Nothing the model would do anyway. Cut motivation, repetition, and tutorials (`CONTEXT-2`).

## References

- Link each reference file directly from `SKILL.md`, one level deep, and say when to read it: "Read `references/api.md` only when the change touches the public API." Files referenced only from other references may be read partially or not at all (`CONTEXT-1`, `CONTEXT-3`). **(lint: the link must exist)**
- Put mutually exclusive or rarely needed material in separate files, so Claude loads only what the task needs.
- Give a reference file over 100 lines a table of contents.
- Effort scales with the task. No mandatory reading of every reference, and no multi-agent ceremony for a one-line fix (`CONTEXT-4`).

## Scripts

Use a script when work is deterministic, repetitive, or checkable. Leaving that work to the model is a finding (`RESOURCES-C1`). Use instructions where judgment is needed.

- **Say whether to run it or read it.** Running is the common case.
- **Reference it through `${CLAUDE_SKILL_DIR}`:** `node "${CLAUDE_SKILL_DIR}/scripts/format.mjs" --input <file>`. Claude's working directory is the user's project, not the skill folder. Refer to the built `.mjs` name; the linter maps it back to the `.ts` source. **(lint)**
- **Contract:**
  - Noninteractive: no prompts, ever (`RESOURCES-3`).
  - Machine-readable output on stdout, diagnostics on stderr.
  - Meaningful exit codes, with distinct results for "not attempted", "unknown", "failed", and "complete". Never exit 0 after a failure.
  - Handle errors in the script with an actionable message, rather than leaving Claude to diagnose a stack trace.
  - Arguments are passed as arguments, never interpolated into shell strings.
- **Examples match the real helper** and look like they were run (`RESOURCES-4`).
- **Dependencies:** scripts are bundled for Node with their npm packages inlined, so add packages to `devDependencies`. No `bun` imports or `Bun.*` globals, no native addons, and no shebang in the source. The build adds one.
- **Tests:** put them next to the code as `*.test.ts` and use `bun:test`. They never ship, and they're type-checked against Bun's types, while everything else in `src/` is checked against Node's.

## Fit into the project

- Cooperate with the repository's conventions and other skills, rather than replacing its workflow or toolchain (`MAINTENANCE-1`).
- Dependencies on other skills, subagents, or tools are explicit (`MAINTENANCE-2`).
- Keep the general method separate from project facts. Give the skill a way to pick up project context, such as "discover the local convention first" or a context file it reads (`MAINTENANCE-C1`).

## Skill checklist

- [ ] The job is coherent and bounded, with inputs, prerequisites, and read or write scope stated.
- [ ] The description routes, and invocation control is set on purpose.
- [ ] The procedure has decision criteria, defaults, freedom matched to fragility, and stopping rules.
- [ ] `SKILL.md` is lean, and references are one level deep, each with a condition for loading it.
- [ ] Checkable, repetitive work lives in a script that meets the contract.
- [ ] Done is observable, and the report separates completed, failed, skipped, and unverified work.
- [ ] `allowed-tools` is no broader than needed.
- [ ] `bun run lint` and `bun run build` pass.
