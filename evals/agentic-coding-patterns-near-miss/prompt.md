---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
runs: 3
---
One test is failing and I can't see why. Here's the output:

```
FAIL src/billing/proration.test.ts
  prorates a mid-month upgrade
    expected: 14.52
    received: 15.00
  at prorate (src/billing/proration.ts:41)
```

`prorate` computes `daysLeft / daysInMonth * price`. The test upgrades on the
17th of a 30-day month at $30. Walk me through how you'd find the actual
cause of this one bug and what you'd check first.
