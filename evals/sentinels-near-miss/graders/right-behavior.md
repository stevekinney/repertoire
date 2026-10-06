---
type: llm
weight: 2
---
The request is for handoff prose to orient a future session, which is not designing a marker or gate. The right behavior is to write the note directly: a concise summary covering what is done (the Stripe webhook), what is in progress (the refund endpoint and its old signature middleware), the Postgres idempotency decision, the next steps in order, and the flaky test. It does not key a marker file with a hash, choose a state directory, pick gate versus handoff, define statuses like passed or blocked, propose deny rules or sandbox settings, or present negative tests for a gate.
