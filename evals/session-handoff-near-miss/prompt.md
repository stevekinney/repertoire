---
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
runs: 3
---
I'm done for the day. Can you write me a good commit message for this staged diff?

```diff
--- a/src/middleware/rate-limit.ts
+++ b/src/middleware/rate-limit.ts
@@ -12,6 +12,9 @@ export function rateLimit(req: Request) {
-  if (count > 100) return new Response('slow down', { status: 503 });
+  if (count > 10) {
+    return new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '60' } });
+  }
```
