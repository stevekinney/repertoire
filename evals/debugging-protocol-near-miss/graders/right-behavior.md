---
type: llm
weight: 2
---
This is new behavior, not a bug, so the right response is to build it test-first: read the order model and packing slip template, write a failing test for the gift note (saved on the order, rejected or truncated past 200 characters, printed on the slip) before the implementation, then make the smallest change that passes and run the surrounding suite. It does not run a bug-diagnosis procedure: no hunt for a reproduction of a failure, no list of competing root-cause hypotheses, no comparison against "working code" to explain a defect. Handling it directly or naming the test-first sibling are both acceptable.
