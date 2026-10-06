---
type: llm
weight: 3
---
The answer delivers a self-contained brief (or the actual dispatch) that a worker with no access to this conversation could start from. It states one bounded assignment (find the cause of the double charge, no fix) and carries the inputs verbatim: commit 4f2a9c1, branch fix/double-charge, the failing command and its output, and the file paths. It names scope and non-goals (src/billing/ out of bounds, no edits), says what the worker may do (read and run commands, no commits or network), and sets a stopping condition that is a command or locatable artifact plus an attempt or turn budget with instructions for when blocked. Fields are filled or explicitly marked none with a reason.
