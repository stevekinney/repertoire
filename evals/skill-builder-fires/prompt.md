---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
runs: 3
---
Every time a release goes out I do the same dance: bump the version in `package.json`, regenerate the changelog from merged PR titles, check that no PR labeled `breaking` slipped into a minor bump, tag it, and then draft the GitHub release notes in our house format. I've done it by hand about six times now and it's different each time. There are real judgment calls in it, like what counts as breaking when the label is missing.

I want Claude to do this the same way every time, and I want some proof it does better than winging it. Can you turn this into a proper skill for me? This repo keeps its skills under `src/skills/`, with guides in `documentation/`.
