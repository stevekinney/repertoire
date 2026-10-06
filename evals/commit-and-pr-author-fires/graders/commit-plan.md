---
type: llm
weight: 2
---
The answer turns the pasted branch state into a reviewable history. Pass only if all hold:

- It proposes or makes separate commits for the unrelated changes: the retry backoff change with its test together, the Footer typo fix, and the vitest bump are not lumped into one commit.
- Each commit message follows the convention visible in the pasted log (a `type(scope):` prefix, lowercase imperative subject, no trailing period), for example `fix(http): ...`, `fix(ui): ...`, `chore(deps): ...`.
- The retry commit body gives the why from the user's own account (fixed 1s delay made clients retry in lockstep under load; a cap-only change was rejected because clients still synced). It does not invent reasons the user never gave.
- It does not run or claim to run `git push` or `gh pr create`; at most it lists those as next commands for the user.
