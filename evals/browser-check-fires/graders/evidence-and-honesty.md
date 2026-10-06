---
type: llm
weight: 2
---
The answer respects the skill's definition of done and its guardrails. It confirms the page is serving the new code (a rebuild or a string unique to the change) before trusting any result, treats console errors, failed requests, loading states, or a redirect to sign-in as failures, and would capture a screenshot after the action and report a verdict. It asks before installing Playwright if it is missing, uses only local hosts, and cleans up only servers it started and its scratch folder. Anything it could not actually run in this setting is reported as unverified, never claimed as passed.
