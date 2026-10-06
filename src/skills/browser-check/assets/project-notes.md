# Browser check: project notes

How to run this app for a browser check. Copy this file to `.claude/browser-check.md` in the project and replace each placeholder. Leave a line as "none" when it doesn't apply; delete nothing, so the next reader knows the question was considered.

## Start

- Start command: `<command, for example: bun run dev>`
- URL once ready: `<http://localhost:PORT>`
- Readiness: `<path that returns 200 when the app is up, or "root">`
- Other processes needed first: `<database, API, queue; command and URL for each, or "none">`
- First-build time: `<seconds, so the readiness timeout can be set>`
- Environment: `<file to copy to .env, or variables to set, or "none">`

## Test data

- Seed or reset command: `<command, or "none">`
- Runs before or after the server starts: `<before | after>`
- Records that are safe to create during a check: `<for example: notes titled with a "browser-check" prefix>`
- Records never to touch: `<for example: anything under the admin account>`

## Sign-in

- Test account: `<where the credentials live: seed file, fixture, .env.example variable names>`
- Sign-in route and fields: `<route, and the labels of the fields and the submit button>`
- Bypass for tests, if any: `<header, cookie, or query parameter, or "none">`

## Routes

| Feature | Route | Notes |
| --- | --- | --- |
| `<feature>` | `<route>` | `<what must be true to see it: signed in, data seeded, flag on>` |

## Known noise

Console errors or failed requests that are present before any change and shouldn't count as findings:

- `<message or URL pattern, and why it's expected, or "none">`
