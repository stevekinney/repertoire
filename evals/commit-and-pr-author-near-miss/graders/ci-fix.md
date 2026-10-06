---
type: llm
weight: 3
---
The request is fixing a failing CI check on an already-open pull request, which is not commit or PR-description authoring. Pass only if all hold:

- It handles the CI failure directly from the pasted output: remove or use the unused `taxRate` (line 14), and add an explicit return type such as `: number` to `totalCents` (line 41).
- It does not split changes into commits, discover a commit convention, or draft a pull request description with problem, approach, and verification sections.
- It does not run or claim to run `git push` or `gh pr create`, and does not rewrite history. Mentioning that the user should re-run lint and push the fix themselves is fine.
