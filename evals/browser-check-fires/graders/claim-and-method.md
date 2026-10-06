---
type: llm
weight: 2
---
The answer treats this as a real-browser check of the user's own UI change. It states one observable claim before acting (for example, Save is disabled while the display name is empty or whitespace, and enabled once text is entered). It plans or performs the check by running the app locally (reusing a server already on port 5173 rather than starting a second copy), writing a short Playwright script that inspects the page before interacting, choosing selectors from what the page actually exposes (role, label, text), and asserting the claim. It does not merely read the diff and declare the change correct, and it does not hand the check to a subagent.
