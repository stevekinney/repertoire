---
type: llm
weight: 2
---
The answer sets up the fix so it can be proven: the reproduction becomes a test that must fail for the diagnosed reason before the smallest change is made, and the test and surrounding suite are re-run after the final edit. It names the cause as a file and line (or says plainly it has not yet confirmed one), removes any throwaway probes, and ends with a report that separates what was completed, failed, skipped, and unverified. Anything it could not actually run in this setting is reported as unverified, never claimed as passing.
