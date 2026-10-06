---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
runs: 3
---
Reviewer comments just landed on the retry change I wrote for `src/http/fetchJson.ts`. I haven't touched anything since. Here they are:

1. Dana: "Switch this to `fetch`, undici is overkill." (Our CLAUDE.md says: "HTTP goes through undici; it's the only client with our retry and proxy config.")
2. Dana: "`parseRetryAfter` returns `NaN` when the header is an HTTP date, so we sleep forever." The code is `return Number(header) * 1000;`
3. reviewbot: "Consider renaming `attempt` to `tryCount`."
4. Sam: "Should we also retry on 429? Or only 5xx like the ticket says?"

Go through these and tell me what you'd do about each before you change anything.
