---
type: llm
weight: 2
---
The answer plans or carries out proof that the skill changes behavior, and meets the definition of done. It proposes at least three scenarios (the normal case, the most common false success, and a near-miss that should not trigger the skill), run as with-skill versus baseline comparisons that the user judges, with grading from resulting files rather than a subagent's summary. It plans to audit the draft with `/repertoire:optimize-component` and run `bun run lint`, and it says it will not run `bun run build` or commit. Any step that was not actually run is reported as skipped or unverified, not as passed.
