---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
runs: 3
---
Third time this week my coding agent has told me "all done, tests pass" on a
feature branch, and then I pull it and the feature is broken. Last night it
said the CSV export was finished. I ran it and it threw on any file with a
comma in a field. The tests it wrote only check that the export function
returns a string.

We use Bun and the repo has a `bun test` script plus a `bun run typecheck`.
I'm not asking you to fix the export. I want to know what practice or setup we
should put around the agent so "done" actually means something, and what in
our toolbox implements it.
