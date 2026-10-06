---
type: llm
weight: 2
---
The answer refuses to ship the rounding guess as a fix. It treats the user's "probably rounding" as a hypothesis, not a finding: the received value is exactly the undiscounted 100, which points at the discount not being applied rather than at rounding. It plans or performs reproduction first (running the failing test, ideally repeatedly, and checking what changed recently with git log or the diff), compares with a working caller of the discount logic, and lists two or more competing explanations with a discriminating experiment for each before proposing any change. It does not wrap the code in `Math.round` or add a guard around the symptom.
