---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
runs: 3
---
Nobody has looked at this yet, so I'd like you to review it before I open a PR. Is it correct?

```diff
--- a/src/cart/total.ts
+++ b/src/cart/total.ts
@@ -38,6 +38,9 @@ export function cartTotal(items: Item[], coupon?: Coupon) {
   let subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
+  if (coupon) subtotal -= subtotal * coupon.rate;
+  if (coupon?.stackable) subtotal -= subtotal * coupon.rate;
   return Math.round(subtotal * 100) / 100;
 }
```
