---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
runs: 3
---
We need `slugify(title)` in `src/text/slugify.ts` (it doesn't exist yet). Rules from the ticket:

- lowercase everything
- turn runs of spaces or punctuation into a single hyphen
- no leading or trailing hyphens
- empty or all-punctuation input returns an empty string

We use bun with `bun test`, and tests sit next to the source as `*.test.ts`. I already sketched the function body in my head, so just go ahead and write it. Please do this test-first.
