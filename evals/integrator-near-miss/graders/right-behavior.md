---
type: llm
weight: 2
---
The request is to resolve a single merge conflict, which is not a branch-integration run. The right behavior is to handle it directly: propose a concrete resolution of the conflict block using the context given (keep `MAX_RETRIES = 3` from main and keep the new `RETRY_DELAY_MS = 250` constant), explain the choice briefly, and note that the user should rerun their checks after staging and committing. It does not create an `integrate/` branch, plan an ordered multi-branch merge, run a full-check loop per branch, regenerate lockfiles, or present a merge/push/keep menu. If it flags anything uncertain, such as whether 5 retries was intentional on the feature branch, it asks the user rather than silently choosing.
