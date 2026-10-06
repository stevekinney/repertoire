# The feature list

`feature_list.json` is the definition of done for every later session. A session may flip one field in it and nothing else, so what you write here is what the project will be judged against. Read this before step 5 of the procedure.

## Shape

The file is a JSON array. Every entry has exactly these fields, in this order (`category` is optional; the rest are required):

```json
[
  {
    "id": "signup-valid-email",
    "category": "functional",
    "description": "Submitting the signup form with a valid email creates an account and lands on the dashboard",
    "steps": [
      "Start the app with ./init.sh",
      "Open /signup",
      "Enter sample-user@example.test and a 12-character password, submit",
      "Expect a redirect to /dashboard showing the entered email",
      "Expect one row in the users table with that email"
    ],
    "passes": false
  }
]
```

- `id`: a unique, stable, non-empty slug. `scripts/check-feature-list.mjs` requires it.
- `category`: a short label a loop can group or filter by. Use the project's own vocabulary when it has one; otherwise `functional`, `ui`, `api`, `cli`, `performance`, or `security`.
- `description`: one sentence of observable behavior, as a user or caller would see it. Not "implement the signup module".
- `steps`: how to reproduce and confirm it by hand, from a started app. The last step is always what to expect. A session that can't follow these steps can't claim the item.
- `passes`: `false` for every entry when this skill writes the file. The sample email above is a sample; use the project's test fixtures when it has them.

Keep the fields to these five unless the project already has a feature-list convention. Extra fields invite a session to edit more than `passes`.

## Quality bar

Each entry should pass all of these:

- **One behavior.** If the description needs "and" to join two outcomes, split it. Two entries that pass separately are worth more than one that half-passes.
- **Checkable from outside.** The steps use the app's surface (a route, a command, a UI), never its internals. "The reducer returns the new state" is a unit test, not a feature.
- **Fails today.** Walk the steps against the scaffold. If they already pass, the entry describes the baseline, and the baseline is proven by the smoke check, not by the list.
- **Small enough for one session.** Roughly: a session of a fresh agent should take it from `false` to `true`, with a commit, without needing a second item. Split anything larger. Prefer more small entries over fewer large ones; the loop stalls on an entry it can't finish.
- **Ordered.** The first entry is the one a later session should take first, usually the one that unblocks the most others. Say the ordering rule in the progress file so a session doesn't resort it.

## The most common false success

A list that looks complete because it was derived from the codebase. Entries like "the API has a users endpoint" describe what exists; they're a changelog. Derive entries from what the project is supposed to do (the spec, the README's promises, the user's answers), and let the code decide only whether an entry already passes.

## The ratchet rule

Write this rule into `CLAUDE.md`, next to the file's path, in these words or close to them (the asset `claude-md-section.md` already carries it):

> Later sessions may change a feature's `passes` field and nothing else. Never remove, reword, or weaken an entry. A wrong entry is a separate, human-approved change.

Prose alone doesn't enforce it. If the project has hooks, suggest, in the report, a `PreToolUse` hook or a diff check that rejects edits to `feature_list.json` touching anything but `passes`. Don't write the hook in this session; it's a policy decision the user makes, and the skill's write scope ends at the baseline commit.

## What to ask the user

Ask in batches of two or three, highest impact first:

1. Which of these are out of scope for the loop, even if the spec mentions them?
2. Which two or three must work first, because the rest depend on them?
3. For any entry where you had to guess the expected outcome: what does passing look like?

Stop asking when the answers stop changing the list.
