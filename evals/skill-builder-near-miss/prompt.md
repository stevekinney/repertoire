---
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
runs: 3
---
Claude keeps running `npm install` in this repo and it's a bun project, which then leaves a stray `package-lock.json` behind. It's happened four times this week. I just want it to stop doing that.

The rule is basically: "This project uses bun. Use `bun install` and `bun run`, never npm or yarn." Where should that go, and can you put it there?
