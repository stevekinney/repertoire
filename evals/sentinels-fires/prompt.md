---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
runs: 3
---
I run an agent loop that reviews a PR and keeps fixing things until the review is clean. Right now it ends when the agent prints `REVIEW_OK`, and twice it printed that after changing code the reviewer never saw. I want the merge step to be blocked unless this exact diff was actually reviewed and approved.

Setup: a repo with a CLAUDE.md that says state lives in `.agent-state/` (not yet created). Reviews run as a separate CI job we control, and the merge is done by a script `scripts/merge.sh`. The agent has full file-edit access to the repo.

Design the approval marker for me: what it's keyed on, who writes it, how the merge script checks it, and how we'd convince ourselves it can't be faked.
