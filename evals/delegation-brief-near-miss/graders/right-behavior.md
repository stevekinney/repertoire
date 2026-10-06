---
type: llm
weight: 2
---
The request is about judging an already-returned worker result, not about writing a new delegation. The right response treats the report's "complete" and "all tests pass" as an unverified claim and says what evidence would settle it: the original acceptance condition, the actual test command with its exit code, and the changed file and lines. It may suggest an independent check (running the tests directly or handing the check to a referee-style verifier). It does not draft a full multi-field delegation brief (assignment, scope, allowed actions, information boundary, stopping condition) for a new worker.
