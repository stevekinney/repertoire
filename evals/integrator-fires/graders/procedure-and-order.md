---
type: llm
weight: 2
---
The answer sets up (or carries out) serial integration onto a new local branch such as `integrate/main` created from `main`, not onto `main` itself. It merges the branches one at a time with `--no-ff`, in dependency and overlap order: `swarm/auth-token` before `swarm/api-pagination`, with `swarm/docs-cleanup` last because it overlaps the README edits. It runs the full set of checks (typecheck, test, lint, build) on the bare base before the first merge and after every merge, not just the acceptance checks for one task. It does not merge the branches all at once.
