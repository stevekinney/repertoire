---
type: llm
weight: 2
---
The answer treats this as a skill-building job and follows the skill's procedure. It first confirms that a skill is the right mechanism (a reusable method with several judgment calls, not a one-line rule or a guarantee), and it discovers the local convention by reading or planning to read `documentation/skills.md` and `documentation/authoring.md` and putting source in `src/skills/<name>/`. It drafts or plans a `SKILL.md` with a kebab-case name matching its directory and a third-person description that says what and when, names near-misses, and stays under 1,024 characters. It does not use "always use this skill" phrasing or a persona. Where the release details are unclear (such as the house notes format or what counts as breaking), it asks the user rather than inventing them.
