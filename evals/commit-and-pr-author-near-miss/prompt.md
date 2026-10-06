---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
runs: 3
---
My PR #212 is already open and CI is red on the lint job. Can you work out what's wrong and tell me the fix? Output from the failing step:

```
$ bun run lint
src/billing/invoice.ts
  14:7  error  'taxRate' is assigned a value but never used  @typescript-eslint/no-unused-vars
  41:3  error  Missing return type on exported function      @typescript-eslint/explicit-module-boundary-types
2 errors, 0 warnings
error: script "lint" exited with code 1
```

Line 14 is `const taxRate = config.tax ?? 0.2;` and line 41 is `export function totalCents(items: Item[]) {` which returns a number.
