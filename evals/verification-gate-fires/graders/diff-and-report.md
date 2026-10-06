---
type: llm
weight: 2
---
The answer plans or performs inspection of the final diff (git diff, git diff --cached, untracked files) for skipped or rewritten tests, leftover debug output, and unrelated changes. It reports in the four parts (completed, failed, skipped, unverified) with a command, exit code, and result lines beside each claim. Anything it could not run in this setting, such as the test suite without Bash access, is reported as unverified with what would prove it, never as passed. It does not edit source, commit, or push, and it does not say "done" or "fixed" without evidence.
