---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
runs: 3
---
I'm about to stop for the day and will pick this up in a fresh session tomorrow. Please write me a handoff note I can paste in. Where things stand:

- Migrating the billing webhooks from Express to Hono; `POST /webhooks/stripe` is done and tested.
- `POST /webhooks/refund` is half ported; signature check still uses the old middleware.
- Decision made: keep idempotency keys in Postgres, not Redis.
- Next: finish refund, then delete `legacy/webhooks.ts`. Known flaky test: `webhook-retry.test.ts`.
