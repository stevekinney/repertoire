---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
runs: 3
---
I'm done for the day and want this turned into commits plus a PR description. Here's the state of my branch `fix-retry-backoff` (base: main):

```
$ git status --porcelain
 M src/http/retry.ts
 M src/http/retry.test.ts
 M src/ui/Footer.tsx
 M package.json
$ git log --no-merges -n 4 --format=%s
fix(http): stop retrying on 4xx responses
feat(ui): add dark mode toggle
chore(deps): bump zod to 3.23.8
fix(ui): align header logo
```

What I did: retry.ts used a fixed 1s delay, so under load every client retried in lockstep and hammered the API. I switched to exponential backoff with jitter (I looked at a fixed cap-only change first, but it still synced clients). I also fixed a typo in Footer.tsx ("Copywrite") while I was in there, and bumped `vitest` in package.json from 1.6.0 to 2.0.5. I ran `bun test src/http` and it passed, 14 tests. I haven't run anything else.
