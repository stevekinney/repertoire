---
type: llm
weight: 1
---
The answer shows the loop-and-verify discipline: it verifies locally with the project's check command before pushing, pushes once per pass, waits for CI and re-checks status rather than assuming success, and bounds the work with a pass limit. It reports in terms of completed, failed, skipped, and unverified work, and treats approvals and the reviewer's own thread resolution as outside its reach rather than claiming done.
