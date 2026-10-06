---
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
runs: 3
---
I'm picking up PAY-482 tomorrow and this codebase has a lot of history, so I don't want to walk in blind. Ticket text:

```
PAY-482: Refunds over $500 fail silently for EU customers
Created: 2026-09-14. Last updated: 2026-10-02.
Comment (dana, 09-16): Looks like the retry in refund-service.ts swallows the 422 from the processor.
Comment (omar, 09-30): We talked about moving large refunds to manual review. Not sure that was ever decided.
```

Before I write a spec, find out what's already been decided, tried, or left hanging about this across our tracker, chat, and git history. Put it together into one file I can work from. If two sources disagree, tell me.
