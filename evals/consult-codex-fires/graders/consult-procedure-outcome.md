---
type: llm
weight: 2
---
The answer treats this as a request for an independent second opinion from OpenAI Codex, not a same-model review. It sets up or describes one read-only, ephemeral Codex run scoped to `main...HEAD` (naming the scope for Codex to read rather than pasting the diff), asks for findings with file:line evidence, and does not let Codex edit anything. It records where the model pin came from, or says there is none and notes the run is not reproducible. If Codex could not actually be run in this setting, it reports that plainly as failed or unverified rather than inventing a Codex verdict.
