---
type: llm
weight: 2
---
The answer treats this as one-time harness setup before any feature work. It first learns the project (git status and log, package.json, the existing dev and test commands) and states the one sentence of "working" it will prove (for example, the server starts and /health returns ok). It plans or writes a start script that wraps the existing `npm run dev`, is safe to run twice, and exits non-zero if the app does not come up. It plans or writes a smoke check and says it must be seen failing against a broken app and then passing against a running one. It puts only commands it actually ran, with what passing looks like, into CLAUDE.md, and lists anything it could not run as unverified rather than claiming it passed.
