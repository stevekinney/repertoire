---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
runs: 3
---
Product wants a "gift note" option at checkout: an optional text field (max 200 chars) that gets saved on the order and printed on the packing slip. Nothing is broken, this is new behavior. The order model lives in `src/orders/order.ts` and the packing slip template is `src/orders/packing-slip.ts`.

Can you build it? I'd like it test-first.
