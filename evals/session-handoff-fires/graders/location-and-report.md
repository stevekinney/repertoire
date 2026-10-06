---
type: llm
weight: 2
---
The answer finds or picks a handoff location without interrogating the user: nothing names one, so it uses the default `HANDOFF.md` at the repository root and says nothing named a location. It writes (or prints, if writing fails) one block between `session-handoff:start` and `session-handoff:end` markers, using `none this session` for sections with nothing to record rather than omitting them. It reports Completed, Failed, Skipped, and Unverified, notes that CLAUDE.md does not point at the file and offers a one-line pointer instead of editing CLAUDE.md, and does not commit, stage, or push anything.
