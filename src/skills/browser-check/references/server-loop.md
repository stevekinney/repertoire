# The server loop

Start the app, wait until it answers, run the check, and leave the machine as you found it. Nothing here is bundled as a script, because how an app starts is project-specific; the project note (`.claude/browser-check.md`) supplies the commands, and this file supplies the order and the checks around them.

## 1. Probe before starting

Request the app URL first. A `curl -sS -o /dev/null -w '%{http_code}' <url>` that returns any HTTP status means something is already listening.

- **Something answers:** reuse it, and record that you didn't start it, so teardown leaves it alone. Confirm it's the project you're checking (the page title, a known route) and not an unrelated app on the same port.
- **Connection refused:** start the app.
- **The port is taken by an unrelated app:** don't kill it. Start the project on another port if its start command accepts one, and use that URL for the rest of the check; otherwise stop and ask.

## 2. Start in the background

Run the start command from the project note (or the `dev` script discovered in `package.json`) as a background process with stdout and stderr redirected to a log file in `.browser-check/`, for example `.browser-check/server.log`. Write the process-group id to `.browser-check/server.pid`. Start it in its own process group (`setsid` on Linux, or `node`'s `detached: true` in a tiny launcher if `setsid` is missing on macOS), because `npm run dev` spawns the real server as a child, and killing only the parent leaves the child holding the port.

When the app has more than one process (a backend and a frontend), start them in dependency order and give each its own log.

## 3. Wait for readiness

Poll the URL every second until it returns a successful status, with a 60-second default timeout (longer if the note says the first build is slow). Don't sleep a fixed interval; a cold build and a warm restart differ by an order of magnitude.

If the timeout passes, read the log before anything else. The usual causes, in order: a missing environment variable (check `.env.example`), a database that isn't up, a port already bound, dependencies not installed. Fix at most one configuration problem and retry once. A second failure is a stop-and-report, with the last twenty log lines.

## 4. Load data and sign in

Run the seed or reset command from the project note after the server is ready, unless the note says it runs before. A reset step is what makes a rerun safe; without one, prefer actions that create data with a run-specific label over actions that mutate shared records.

Sign-in belongs in the Playwright script, not in the shell, so the session is reusable; see the auth section of `references/playwright-recipes.md`.

## 5. Confirm the build is current

After each source edit, check that the server rebuilt: a log line about the rebuild or a page reload, or a string that exists only in the new code appearing in the response. Without this, a passing check may be checking the old bundle.

## 6. Tear down

Stop the process group you started (`kill -- -<pgid>`), wait for the port to free, and confirm with the same probe as step 1. If the probe still answers, a child survived; find it by the port you started it on (`lsof -ti :<port>`) and stop that, but only on a port you started, never on one you found in use. Leave anything you didn't start. Keep the log until the report is written, because the failure section quotes it.
