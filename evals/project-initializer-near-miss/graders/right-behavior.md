---
type: llm
weight: 2
---
This is ending a session, not setting up a repository. The right response is a session handoff: record what was done, the exact failing test and its error as still failing (not summarized away), the uncommitted change in src/routes/notes.ts, and a concrete next step, appended to the existing progress file rather than replacing it, without marking the feature as passing. It does not rebuild init.sh or smoke.sh, rewrite the feature list, draft a new list of features, make a baseline commit, or run the initializer's setup procedure. Handling the handoff directly or deferring to the session-handoff sibling are both acceptable.
