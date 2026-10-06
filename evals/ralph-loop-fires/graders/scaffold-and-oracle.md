---
type: llm
weight: 2
---
The answer sets up a scaffold for a loop that runs a fresh `claude -p` per task, and does not run the loop itself in this conversation. It treats the `tsc` error count as the oracle (a single integer score where `0` means done) and plans to prove the oracle can fail before relying on it: it fails closed when the tool is missing, a regression lowers the score, and a gaming move (a `ts-ignore`, a deleted or skipped test) does not raise it. It notes that specs are missing and must be written first (one file per topic), or asks for them, rather than skipping them. The queue is derived from the work itself (the next file still failing `tsc`) or justified otherwise.
