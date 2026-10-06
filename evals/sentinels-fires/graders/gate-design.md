---
type: llm
weight: 2
---
The answer designs a gate, not a handoff, because the merge proceeds on the marker alone. It keys the marker to a hash of the inputs that matter (the procedure or review version, the tree or diff, the lockfile), so a changed diff yields a different name and a stale approval is simply absent, and it does not key on modification time. The marker records a status such as passed, failed, blocked, or aborted rather than a bare "done". The writer is the CI review job (or another party the agent cannot touch), and the answer does not have the agent write its own approval; it prints the writer's command instead. The merge script's check denies on every non-zero outcome (fail-closed), and the answer never suggests reading the marker's contents into context.
