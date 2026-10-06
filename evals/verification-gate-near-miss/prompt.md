---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
runs: 3
---
Can you review this change for quality before I open the PR? I care about naming, structure, and whether it's the simplest way to do it. I'm not asking whether the tests pass, just how the code reads.

```diff
--- a/src/cart/totals.ts
+++ b/src/cart/totals.ts
+export function calc(items: Item[], c: string) {
+  let t = 0;
+  for (let i = 0; i < items.length; i++) {
+    t = t + items[i].price * items[i].qty;
+  }
+  if (c === "SAVE10") t = t - t * 0.1;
+  return t;
+}
```
