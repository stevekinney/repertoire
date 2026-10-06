---
type: llm
weight: 2
---
The answer includes a filled pull request description. Pass only if all hold:

- It has sections or equivalent content for the problem, the approach, considered and rejected alternatives, verification, where a reviewer should look first, and the commit list.
- The rejected alternative is the cap-only change the user named; it does not fabricate other alternatives.
- Verification reports only `bun test src/http` (14 tests passing) as the user's claim, and states that nothing else (lint, typecheck, the full suite, or checks for the Footer and vitest changes) was run or verified. It does not invent command output.
- No unfilled `[[...]]` or similar placeholders remain.
