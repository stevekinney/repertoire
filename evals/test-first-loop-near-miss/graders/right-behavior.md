---
type: llm
weight: 2
---
A failing test already exists, so this is a debugging task, not a new-behavior TDD cycle. The right response treats the reported failure as the reproduction and diagnoses why the minutes are dropped (reading `parse-duration.ts`, considering more than one explanation, such as a regex or loop that stops after the first unit) before making a fix, then re-runs that test and the surrounding suite. It does not write a new test first, does not run a red-green-refactor cycle, does not delete code under a "code before its test" rule, and does not delegate test design. Handling it directly or following a debugging approach are both acceptable.
