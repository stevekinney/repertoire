---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
runs: 3
---
I already wrote the spec for our CSV export feature and a teammate is about to start on it. Before they do, can you read it as if you were the engineer picking it up and tell me what they'd still have to guess? Here it is:

```
# Spec: CSV export
Status: Approved
Users can export their invoices as CSV from the Invoices page.
- Export button downloads a file with all invoices.
- Large accounts should still work.
Acceptance: export works correctly.
```
