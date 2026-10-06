---
type: llm
weight: 2
---
The change is backend-only, so the right response is completion verification of non-UI work: identify what would prove the fix (a test or direct run with a quoted comma-containing field, plus the project's existing test, type, and lint commands), run or plan to run that evidence, and report honestly what was and was not verified. It does not start a dev server, write Playwright scripts, take browser screenshots, or read a browser console. Mentioning the verification-gate sibling or handling the verification directly are both acceptable.
