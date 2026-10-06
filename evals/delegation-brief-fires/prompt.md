---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
runs: 3
---
I'm about to hand off a bug hunt to a subagent and I keep getting vague results back. Here's the situation. Our checkout service intermittently charges customers twice. Repro, on commit 4f2a9c1 of branch `fix/double-charge`:

```
$ bun test src/checkout/charge.test.ts
FAIL  retries once after a timeout without duplicating the charge
  expected 1 call to gateway.charge, received 2   (exit code 1)
```

The retry logic lives in src/checkout/charge.ts and src/checkout/retry.ts. src/billing/ belongs to another team, so nobody should touch it. I want the worker to find the cause, not fix it. Write what I should send to the agent.
