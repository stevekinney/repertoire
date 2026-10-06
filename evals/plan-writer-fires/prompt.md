---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
runs: 3
---
We need to move our app from cookie sessions to short-lived JWTs with refresh tokens, and I'm nervous about it. It touches the login route, the auth middleware, the websocket handshake, and the mobile client, and I don't know this codebase well yet. Getting the approach wrong would cost us a week. Here's the ticket:

```
AUTH-212: Replace cookie sessions with JWT access tokens (15 min) + rotating refresh tokens.
Must keep "remember me" working. Logout must invalidate refresh tokens server-side.
Out of scope: SSO, anything under src/billing/.
```

I want to read what you find before anything gets designed or built. Can you work out what exists and then lay out how to do this?
