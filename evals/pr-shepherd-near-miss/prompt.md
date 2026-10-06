---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
runs: 3
---
My PR #340 shows a red check and I don't get why. Please don't change anything or push, I just want to understand it. This is the log tail:

```
> vitest run
 FAIL  src/api/client.test.ts > retries on 503
 Error: Test timed out in 5000ms.
 Tests  1 failed | 41 passed
Error: Process completed with exit code 1.
```

What is this telling me, and is it something I broke? My diff only touched `src/ui/Badge.tsx`.
