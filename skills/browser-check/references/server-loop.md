# The server loop

Starting, waiting for, and stopping the app is done by `scripts/server.mjs` (see the procedure in `SKILL.md`). This file covers what the script doesn't: apps with more than one process, data, rebuild checks, and stubborn children. The project note (`.claude/browser-check.md`) supplies the commands.

## Several processes

The script manages one command per `start`, and one recorded group. When an app has a backend and a frontend, run the backend's `start` first, wait for it, then the frontend's; each `start` replaces the recorded group, so tear the first one down by hand: read the group id before starting the second, and `kill -- -<pgid>` it at teardown. Prefer a single project script that launches both (the `dev` script), which keeps them in one group.

## Load data and sign in

Run the seed or reset command from the project note after the server is ready, unless the note says it runs before. A reset step is what makes a rerun safe; without one, prefer actions that create data with a run-specific label over actions that mutate shared records.

Sign-in belongs in the Playwright script, not in the shell, so the session is reusable; see the auth section of `references/playwright-recipes.md`.

## Confirm the build is current

After each source edit, check that the server rebuilt: a log line in `.browser-check/server.log` about the rebuild or a page reload, or a string that exists only in the new code appearing in the response. Without this, a passing check may be checking the old bundle.

## When `stop` leaves something behind

After `stop`, probe the URL again with `curl -sS -o /dev/null -w '%{http_code}' <url>`. If it still answers, a child escaped the group. Find it by the port you started it on (`lsof -ti :<port>`) and stop that, but only on a port you started, never on one that was `found` in use. Keep the log until the report is written, because the failure section quotes it.
