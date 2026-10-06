---
type: llm
weight: 2
---
The request is timed repetition, a poll on an interval, not a request to scaffold a Ralph loop. The right behavior is to handle it directly or point to the built-in `/loop` command (for example `/loop 5m` with the health check), and to say that the polling itself cannot happen from a one-shot answer if it has no way to wait. It does not create `loop.sh`, `PROMPT_build.md`, specs, or a `.ralph/` directory, does not ask for a dollar budget, iteration cap, oracle, or veto paths, and does not walk through proving an oracle can fail or a calibration iteration. It does not fabricate a "healthy" result it never observed.
