---
type: llm
weight: 2
---
The request is a one-file change in known code with an obvious check, so it needs no research and plan documents and no review stops. The right response handles it directly and briefly: change the default from 5000 to 10000 in src/config/defaults.ts, update the assertion on line 14 of the test, and run that test file (or the suite) to confirm it passes. It may remark that plan mode or a plain edit is enough. It does not write or propose research.md or plan.md, dispatch scouts, split the work into phases, or ask the user to review an intermediate document.
