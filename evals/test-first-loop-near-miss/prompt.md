---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
runs: 3
---
`parseDuration` is broken and CI is red on it. The test already exists and fails:

```
FAIL src/time/parse-duration.test.ts
  ✕ parses "1h30m" as 5400 seconds (3 ms)
    Expected: 5400
    Received: 3600
      at Object.<anonymous> (src/time/parse-duration.test.ts:9:30)
```

The function is in `src/time/parse-duration.ts`. Can you figure out why it ignores the minutes part and fix it?
