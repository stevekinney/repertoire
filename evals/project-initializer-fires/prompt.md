---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
runs: 3
---
/repertoire:project-initializer

I'm about to hand this repo to a bunch of agents running overnight in a loop, and right now it's a mess for that. It's a small Express API with a package.json (`npm run dev` starts it on port 3000, `npm test` runs vitest) and a README that lists what it should do:

- GET /health returns {"ok": true}
- POST /notes creates a note, validated with zod
- GET /notes lists notes, newest first
- DELETE /notes/:id removes one

Working tree is clean. Can you get it ready so those agents don't flail? I'll be watching, so show me what you decide as you go.
