---
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
runs: 3
---
Tiny one. In src/config/defaults.ts the `requestTimeoutMs` default is 5000 and I want it to be 10000. It's only referenced in src/config/defaults.test.ts, line 14:

```
expect(defaults.requestTimeoutMs).toBe(5000)
```

I know exactly what to change. Walk me through the edit and how I'd check it worked.
