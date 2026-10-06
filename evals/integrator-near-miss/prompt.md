---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
runs: 3
---
I'm in the middle of merging `feature/retry` into `main` and git stopped with a conflict in one file. Can you resolve it for me? Here is the file as it sits now:

```
<<<<<<< HEAD
export const MAX_RETRIES = 3;
=======
export const MAX_RETRIES = 5;
export const RETRY_DELAY_MS = 250;
>>>>>>> feature/retry
```

`main` has had MAX_RETRIES = 3 since the rate-limit incident. The feature branch adds a delay constant I do need.
