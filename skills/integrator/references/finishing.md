# Finishing: the end menu and cleanup

Read this only after the user has picked an item from the menu. Each action below runs once, after an explicit choice, and reports what it did.

## 1. Merge into the base locally

The integration branch contains the base, so the base can fast-forward. Refuse anything else: a non-fast-forward merge here means the base moved during the run, and a merge commit onto it would hide that.

```sh
git switch <base>
git merge --ff-only integrate/<base>
```

If `--ff-only` fails, the base has new commits. Stop and report: the user can rebase the integration branch, or merge the base into it and re-run the checks (step 4 and 5 of `SKILL.md`, treating the base as one more branch). Do not force it.

Do not push afterwards. Say that the base is ahead of its remote and leave the push to the user.

## 2. Push and open a pull request

```sh
git push -u origin integrate/<base>
gh pr create --base <base> --head integrate/<base> --fill
```

Pushing a branch that exists only locally is the only push this skill makes, and only here. Stop after the pull request is open; do not merge it, enable auto-merge, or request reviewers unless asked. A pull request description that explains why the change was made is a different skill's job; `--fill` is a placeholder the user can replace.

## 3. Keep the branch

Nothing runs. Return to the branch noted in step 1 of `SKILL.md` with `git switch <branch>`, and say that `integrate/<base>` is waiting.

## Worktree cleanup

Offer this after option 1 or 2, as a separate question. Removing a worktree is a judgment that nobody needs what is in it, so prove that before each removal:

```sh
git worktree list --porcelain
git merge-base --is-ancestor <branch> <base>      # or the pushed integration branch
git -C <worktree path> status --porcelain --ignored
```

Remove a worktree only when all three hold: its branch is an ancestor of where the work landed, its tree is clean, and the ignored files listed are ones the user does not need (a local database or an `.env` copy is a question, not an assumption). Then:

```sh
git worktree remove <path>     # never --force
git branch -d <branch>         # separate step; refuses if unmerged
```

Never `rm -rf` a worktree. If `git worktree remove` or `git branch -d` refuses, report it and leave it; the refusal is evidence that something is not yet merged or not yet clean.

Worktrees this skill did not create are not its to remove. Remove only the workers' worktrees for branches on the merge list.
