---
type: llm
weight: 2
---
The answer treats this as turning an unwritten idea into a spec, not as an implementation job. It does not write source code, scaffolding, or a prototype. It says it will learn the repository's conventions or looks for them (where specs live, how the closest feature is built), and it interviews the user rather than guessing: it asks, or plans to ask via an interactive question tool, a small number of design-changing questions with concrete options, such as who the search is for, what it covers, the empty and no-match behavior, permissions, and what is out of scope. It does not answer those questions itself or silently decide them. It does not delegate the interview to a subagent.
