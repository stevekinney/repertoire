---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
runs: 3
---
/repertoire:ralph-loop

I want to set up a Ralph loop for my repo. We have about 340 TypeScript errors left after turning on `strict`, and I'd like a fresh Claude per error-heavy file instead of one giant session getting confused.

Here's what the checker gives me today:

```
$ npx tsc --noEmit | grep -c "error TS"
340
```

CLAUDE.md has the commands (`npm test`, `npx tsc --noEmit`). Budget is $40 total and 25 iterations. Don't touch `src/generated/` or the tests. I'll be at my desk for the first run. Tree is clean and I haven't written any specs yet.
