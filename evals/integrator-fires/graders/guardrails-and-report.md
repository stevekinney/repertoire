---
type: llm
weight: 2
---
The answer respects the skill's stopping rules and definition of done. On a source-file conflict it aborts the merge and reports the branch and files rather than resolving them. On a failing check it resets to the pre-merge commit and reports the branch, command, and output rather than fixing it. It regenerates `bun.lock` once at the end, then runs the full checks again after that last change. It never pushes or touches `main`, and it ends by offering a menu (merge locally, push and open a PR, or keep the branch) and waiting for the user's choice. It reports Completed, Failed, Skipped, and Unverified, and does not claim a pass for any check it did not actually run.
