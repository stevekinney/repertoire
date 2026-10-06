## Commands

Run these in this order. Each one was verified on <YYYY-MM-DD>. A command that stops matching this description is a bug in this file, not a reason to guess.

| Step    | Command                | Passing looks like                                  | Takes   |
| ------- | ---------------------- | --------------------------------------------------- | ------- |
| Install | `<install command>`    | exit 0; last line `<verbatim last line>`            | `<~Ns>` |
| Build   | `<build command>`      | exit 0; `<artifact path>` exists                    | `<~Ns>` |
| Test    | `<test command>`       | exit 0; last line `<verbatim summary line>`         | `<~Ns>` |
| Start   | `./init.sh`            | prints `<ready line>` and keeps running             | `<~Ns>` |
| Smoke   | `./smoke.sh`           | exit 0; last line `<verbatim last line>`            | `<~Ns>` |

Replace every `<placeholder>` with what you observed in this session. Delete a row only if the project has no such step, and say so in a line below the table. Remove this paragraph.

## Agent harness

- Feature list: `feature_list.json`. Take the first entry whose `passes` is `false`. You may change a feature's `passes` field and nothing else. Never remove, reword, or weaken an entry; a wrong entry is a separate, human-approved change.
- Progress file: `claude-progress.md`. Read it and `git log --oneline -10` before touching anything. Append an entry before the session ends; never rewrite earlier entries.
- Every session starts by running the Start and Smoke rows above. If Smoke fails before you've changed anything, fixing that comes before any feature.
- One feature per session, committed with a message that names it. Flip `passes` only after the feature's steps were followed against the running app in that session.
