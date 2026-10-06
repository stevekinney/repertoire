# Setting up and troubleshooting the Codex consult

Read this when a run exits 5 or 6, when the first consult in a new environment fails, or when configuring the model pin, the sandbox exclusion, or billing. The user makes every settings change described here; the skill only reports what is needed.

## Contents

1. The project note
2. Sandboxes do not nest (exit 6)
3. Why the script closes stdin itself
4. User configuration and MCP servers
5. Two bills
6. Latency and the timeout
7. Pin and probe after upgrades
8. Codex is not installed (exit 5)
9. The official plugin instead

## 1. The project note

`.claude/consult-codex.md` in the project root holds the local facts the skill cannot know. Keys are one per line at the top; anything after a blank line is passed to Codex verbatim as standing notes.

```
model: gpt-5.4
timeout: 540
ignore-user-config: true

This repository uses Bun. Ignore `skills/`; it is generated from `src/skills/`.
```

Offer to write it when a consult ran without a pin. Do not write it unasked; it is a file in the user's repository.

## 2. Sandboxes do not nest (exit 6)

A sandbox is operating-system isolation around what an agent's shell commands can reach. On macOS, Codex cannot start its own sandbox inside Claude Code's: the run fails with `sandbox_apply: Operation not permitted`, which the script reports as exit 6.

The fix is to take the consult out of Claude Code's sandbox and let Codex sandbox itself, which it does with `--sandbox read-only`. In Claude Code settings (`~/.claude/settings.json` or the project's `.claude/settings.json`), add a pattern matching the invocation to `sandbox.excludedCommands`. Check the Claude Code sandbox documentation for the exact pattern syntax of the installed version; the script path contains the plugin's install directory, so match on the script name, for example a pattern ending in `consult-codex/scripts/codex-exec.mjs *`.

Two things to know before excluding it:

- **An excluded command runs with the user's full permissions.** The built script lives in the plugin's install directory, not the repository, so nothing an agent edits in the project changes what runs unrestricted. If the plugin is loaded from a working copy (`claude --plugin-dir`), the script is editable by the agent; exclude it only in a checkout you trust.
- **A redirect keeps a command sandboxed.** Claude Code does not exclude a command that contains a shell redirect, even `< /dev/null`. That is why the script closes stdin in-process (section 3) rather than by redirect: the invocation has no redirect, so the exclusion applies.

The exclusion is a settings change with real blast radius. Report that it is needed and let the user make it.

## 3. Why the script closes stdin itself

`codex exec` appends anything on stdin to the prompt. When another agent launches it, stdin may never close, so Codex waits forever or exits 0 having done nothing but print `Reading additional input from stdin...`. The script spawns Codex with stdin ignored (opened on the null device), writes the final message to a fresh `mktemp` path on every call so a failed call cannot reread an earlier verdict, and requires both exit 0 and a non-empty file. Exit 3 is that check failing.

If you ever call `codex exec` by hand instead, add `< /dev/null` and the same two checks.

## 4. User configuration and MCP servers

`--ephemeral` only stops Codex from saving the session. The user's `~/.codex/config.toml` still loads, including any MCP servers it enables, and the read-only shell sandbox does not constrain an external MCP service. When the review must exclude them, set `ignore-user-config: true` in the project note or pass "ignore user config" in the arguments; the script forwards `--ignore-user-config`. Project-level Codex configuration (`.codex/` in the repository, `AGENTS.md`) still applies; read it when a verdict looks steered.

## 5. Two bills

- The consult is paid by whatever Codex is signed in as. With `OPENAI_API_KEY` in the environment it moves to per-token API billing; without it, Codex uses its own login. The script prints which on stderr at the start of every run.
- The script removes `ANTHROPIC_API_KEY` from Codex's environment. Codex has no purpose for it, and a `claude -p` started by anything Codex runs would otherwise land quietly on API billing instead of the user's plan.
- Review gates that run a consult every time an agent tries to stop drain usage limits fast. This skill is one call per question; do not wire it into a stop hook without a budget.

## 6. Latency and the timeout

A consult takes minutes; a large scope at high reasoning takes longer. The script's default timeout is 540 seconds, chosen to fire before the Bash tool's 600-second cap so the exit code is 4 rather than a tool timeout with no diagnostic. Pass the Bash tool `timeout: 600000` for every run. When 4 fires, narrow the scope first; raising the timeout past 600 needs `run_in_background`, and then the verdict arrives as a task notification.

## 7. Pin and probe after upgrades

Pin the model in the project note. After upgrading either CLI (`codex --version`, `claude --version`), rerun one small known question by hand, for example "Does `README.md` exist? Answer yes or no", and confirm exit 0 and a non-empty verdict before trusting a real consult. Flag behavior and sandbox handling change between versions, and the first failure after an upgrade is usually that, not the code under review.

## 8. Codex is not installed (exit 5)

`codex` is not on PATH. Install the Codex CLI (`npm i -g @openai/codex`), sign in with `codex login`, and run the probe from section 7. The skill reports this and stops; it does not install anything.

## 9. The official plugin instead

OpenAI's Codex plugin for Claude Code (`/codex:review`, `/codex:adversarial-review`, `/codex:rescue`, with `--background`, `/codex:status`, and `/codex:result` for long jobs) wraps the same `codex exec` call and drives the local Codex install and login. Prefer it when the user already has it installed and wants a review with no custom question or schema. Prefer this skill when the question, scope, schema, or verification step matters, or when the output must stay out of the main context.
