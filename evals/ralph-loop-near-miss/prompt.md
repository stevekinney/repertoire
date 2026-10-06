---
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
runs: 3
---
My staging deploy takes a while and I keep forgetting to check it. Can you keep re-running this every 5 minutes for the next hour and tell me when it flips to healthy?

```
$ curl -s https://staging.example.com/healthz
{"status":"deploying","version":"2.14.0-rc1"}
```

If it's still deploying, just wait and check again. Tell me as soon as it says `"status":"healthy"`.
