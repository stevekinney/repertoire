---
type: llm
weight: 2
---
The answer works in red, green, refactor order and does not just hand over the implementation. It first checks the project's conventions (the `bun test` command, a single-file run form, a sibling `*.test.ts` to mirror), splits the ticket into separate observable behaviors (lowercasing, collapsing separators to one hyphen, trimming edges, empty or punctuation-only input), and writes a failing test for the first behavior before any `slugify` code. It requires the run to fail for the right reason (an assertion mismatch or "not found" naming `slugify`, not a syntax or runner error) and quotes or plans to quote that failing line. It then writes only the minimum code to pass, one behavior at a time, rather than the whole function from the user's mental sketch. Tests go through the public `slugify` function without mocking internals.
