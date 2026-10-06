---
type: llm
weight: 2
---
The answer refuses to simply declare the bug fixed on the user's word. It writes the claim as a specific statement (for example, `parseDuration("1h30m")` returns 5400) and notes the user's hedge ("I think", "should") and the stale test run from before the last edit do not count as evidence. It says the proving command must be found (CLAUDE.md, package.json scripts, CI config, in that order) and rerun in full after the final edit, with the summary line, counts, and exit code read, not the exit code alone. It also says a regression test for the reported input must exist in the diff.
