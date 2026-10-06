---
type: llm
weight: 2
---
The request is for a commit message, which the session-handoff skill explicitly does not cover. The right behavior is to write the commit message directly from the diff: a concise imperative subject line (for example, return 429 with Retry-After once a client exceeds 10 requests), and optionally a short body noting the limit dropped from 100 to 10 and the status changed from 503 to 429. It does not write or update a HANDOFF.md or progress file, does not run a date or git-grounding procedure, does not produce a Done / In progress / Tried and abandoned / Next step document with verification stamps, and does not commit anything. Mentioning that a handoff could be written on request is acceptable; doing it unasked is not.
