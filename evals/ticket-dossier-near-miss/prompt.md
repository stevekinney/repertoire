---
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
runs: 3
---
Here's the one design doc for our webhook retries. Can you pull out the owner, the status, the decision date, and the retry limit? I just need those four fields.

```
# Webhook retry policy
Owner: Priya Raman
Status: Approved
Decided: 2026-08-21
Summary: Failed deliveries retry with exponential backoff, up to 6 attempts,
then land in the dead-letter queue. Earlier draft said 10 attempts; reduced
after the capacity review.
```
