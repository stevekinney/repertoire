---
type: llm
weight: 2
---
The user already has a written spec and wants it reviewed cold for gaps, so this is a review job, not a new interview. The right behavior is to read the spec as an implementer and list what they would still have to guess, directly or by handing it to a cold-reading reviewer (a junior-engineer style review), for example: which columns and format, what "all invoices" and "large accounts" mean in measurable terms, empty-account and failure behavior, permissions, and that "export works correctly" is not an observable acceptance criterion. It does not start an interview of the user about a feature idea, does not rewrite or write a new SPEC.md from scratch, and does not implement anything.
