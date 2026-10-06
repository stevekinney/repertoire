# GitHub commands for the shepherd

Exact invocations for the operations that aren't needed on every pass. Values in angle brackets are placeholders; the owner and repo placeholders `{owner}` and `{repo}` are expanded by `gh` itself for the current repository.

## Reading a failing check's log

`gh pr checks --json link` gives a URL like `https://github.com/<owner>/<repo>/actions/runs/<run-id>/job/<job-id>`. Take the two numbers from it.

```sh
gh run view <run-id> --log-failed            # only the failed steps, across jobs
gh run view <run-id> --job <job-id> --log    # the whole log for one job
gh run view <run-id> --json conclusion,attempt,headSha   # attempt > 1 means someone already reran it
```

Compare with the base branch to classify a failure as unrelated:

```sh
gh run list --branch <base> --workflow '<workflow name>' --limit 3 --json conclusion,headSha,url
```

A check that comes from a status API rather than GitHub Actions has an external `link`. Open it with `gh api` only if it's on `api.github.com`; otherwise report the link and classify from what `gh pr checks` shows.

## Replying to a review thread

Use the thread `id` from the status query. Write the reply to a file first (`reply.md` is a sample name) and let `gh` read it with `@`, so the body is never pasted into a shell string.

```sh
gh api graphql -F id='<thread-id>' -F body=@reply.md -f query='
  mutation($id:ID!,$body:String!){
    addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id, body:$body}){ comment{ url } } }'
```

Before posting, confirm the thread's last comment is not already yours (`gh api user --jq .login` gives the login), so a rerun never double-replies. For feedback that lives in a review body rather than a thread, reply at PR level: `gh pr comment <n> --body-file reply.md`.

## Resolving a thread

Only when the local convention says the author resolves, and only after the fix is pushed.

```sh
gh api graphql -F id='<thread-id>' -f query='
  mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread{ isResolved } } }'
```

## Reading `mergeStateStatus`

| Value | Meaning | What to do |
| --- | --- | --- |
| `CLEAN` | Mergeable, checks pass | Nothing; confirm the other two checks |
| `BEHIND` | Base has moved, no conflict | Update from the base (step 2) |
| `DIRTY` | Conflicts with the base | Resolve (step 2) |
| `UNSTABLE` | Mergeable, a non-required check fails | Fix if caused by the PR; otherwise report |
| `BLOCKED` | Branch protection: approvals, CODEOWNERS, or a required check | Fix a required check; otherwise it's the user's, report under unverified |
| `HAS_HOOKS` | Pre-receive hooks pending | Treat as pending |
| `UNKNOWN` | Not computed yet | Wait 15 seconds and re-query, up to four times |

## Confirming it's the user's branch

```sh
gh pr view <n> --json author,isCrossRepository,headRepositoryOwner --jq '{author: .author.login, fork: .isCrossRepository, owner: .headRepositoryOwner.login}'
gh api user --jq .login
```

A fork, or an author other than the login, means ask before pushing.
