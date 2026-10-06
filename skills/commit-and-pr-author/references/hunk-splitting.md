# Splitting one file across two commits without `git add -p`

`git add -p` prompts, so it hangs a noninteractive session. The noninteractive equivalent is to stage a trimmed patch. Do it exactly as written; the index is easy to leave half-staged.

## Procedure

1. Start from a clean index for this file: `git reset -q -- <file>`.
2. Write the file's full unstaged diff to a scratch path outside the repository:

   ```sh
   git diff -- <file> > /tmp/split.patch   # sample path
   ```

3. Read the patch. Each hunk starts with a line like `@@ -120,7 +120,9 @@`. Decide which hunks belong to the commit you are staging now.
4. Build the trimmed patch by copying the file header (the lines from `diff --git` through `+++ b/<file>`) and then only the chosen hunks, each complete and unchanged from `@@` to the line before the next `@@`. Dropping whole hunks keeps the remaining hunk headers valid; editing inside a hunk does not, so never do that. Write it with a heredoc to a second scratch path.
5. Stage it: `git apply --cached /tmp/keep.patch`. A rejection means a hunk was cut mid-way or the header was lost. Rebuild from step 2 rather than editing the rejected patch.
6. Confirm: `git diff --cached -- <file>` shows only the chosen hunks, and `git diff -- <file>` shows the rest still in the working tree.
7. Commit as usual. The remaining hunks go in a later commit by the normal `git add -- <file>`.

## When two commits' changes sit in the same hunk

Context lines fall within three lines of each other, so related and unrelated edits can share one hunk. Options, in order of preference:

1. `git diff -U0 -- <file>` produces hunks with no context, which usually separates them. Apply the trimmed result with `git apply --cached --unidiff-zero`.
2. If they still share a hunk, the edits are adjacent lines. Commit the file whole in the commit it mostly belongs to, and say in the report that the split stopped at the file boundary.

## Not for

Binary files (commit them whole), and files that already have staged changes you didn't put there (ask before resetting them).
