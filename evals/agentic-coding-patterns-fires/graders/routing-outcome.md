---
type: llm
weight: 3
---
The answer routes the symptom (agent claims done, feature broken, weak agent-written tests) to exactly one pattern, a verification loop (a mechanical oracle the agent must pass before claiming done). It does not list or recommend all the patterns. It states in a sentence why the pattern's reasons not to use it do not apply here (a real oracle exists via `bun test` and typecheck, but it flags that the agent-written suite is weak). It names a concrete implementation, such as the `verification-gate` skill or a hook or CI check, and what inputs it needs (the verified check commands). It does not fix the CSV export or write the verification setup itself.
