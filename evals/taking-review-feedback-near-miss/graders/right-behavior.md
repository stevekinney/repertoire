---
type: llm
weight: 2
---
The user asked for a review of their own unreviewed diff, and no review comments exist. The right answer performs the review directly: it reads the diff and reports concrete findings, such as the coupon rate being applied twice for stackable coupons (the unconditional first line already applies it, so the second line double-discounts), and possibly that stacking semantics are unclear. Alternatively it points to the review-change workflow as the right tool. It does not run a triage of incoming reviewer feedback: no numbered accept/push back/ask list of reviewer comments, no restating of reviewer items, and no drafted replies to a review thread. It does not edit files or open a PR.
