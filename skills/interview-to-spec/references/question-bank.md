# Question bank

Questions that change a design, grouped by what they decide, plus how to phrase them as `AskUserQuestion` options. Pick from here; don't ask the whole list. A question earns its place in a round only if a different answer would change what gets built.

## Contents

- [Phrasing options](#phrasing-options)
- [Audience and purpose](#audience-and-purpose)
- [Edges](#edges)
- [Scope](#scope)
- [Verification](#verification)
- [Reading the answers](#reading-the-answers)

## Phrasing options

- Each option is a real alternative with its consequence in the description. "Reject with 409; callers retry" and "Last write wins; earlier value is lost" are options. "Yes" and "No" are not, because the user can't see what they're choosing between.
- Put the option you'd default to first, and say so in its description, so "you decide" has a visible meaning.
- Use multi-select only for independent items (which channels, which roles). A design choice is single-select.
- Ask about behavior the user can picture, not mechanisms. "What should the user see when the upload fails?" rather than "Should we use a retry queue?"
- Hold a question back if the code answers it. Cite the file in the spec instead, and let the user strike it at approval.

## Audience and purpose

- Who triggers this, and what do they do today instead? (The answer sets the baseline the acceptance criteria compare against.)
- Is it for every user, a role, or an internal tool? (Decides auth, UI polish, and error wording.)
- What is the one outcome that, if it didn't happen, would make the feature pointless? (Becomes the end-to-end verification.)
- Is this replacing something, or adding beside it? (Decides migration, deprecation, and whether old behavior stays.)

## Edges

Ask these for whatever the feature takes in or produces: a list, a file, a request, a form, a job.

- Empty or missing: skip silently, show an empty state, or fail with a message?
- Duplicate: reject, merge, or allow and dedupe later? (Decides idempotency and the "second run" behavior.)
- Too large or too many: cap, paginate, or stream? Where does the number come from?
- Partial failure: roll back, leave what succeeded, or retry? What does the user see in each case?
- Wrong caller: a different user, an expired session, a missing permission.
- Concurrency: two users or two jobs at once. Last write wins, lock, or conflict shown?
- Time: timezones, daylight saving, a clock that's wrong, a job that runs late.
- Offline or degraded: a dependency is down. Fail fast, queue, or degrade?

## Scope

- Of the things a reader would expect alongside this, which are deliberately not in it? (Write each with the reason, so the exclusion survives review.)
- Does it need to work on existing data, or only new data from now on?
- Which surfaces: API only, UI only, CLI, all of them? Which one ships first if they're split?
- Is there a hard date or a dependency that decides what can be cut?

## Verification

- How would you check it works without reading the code? (The answer is the first acceptance criterion.)
- What would a wrong implementation that still passes the obvious test look like? (Add a criterion that catches it.)
- Which existing test command must stay green? If the project has none, is adding one in scope?
- What does the user observe when it fails? (Error text, status code, log line, or nothing: each is a criterion.)

## Reading the answers

- An answer that contradicts an earlier one is a question, not a typo. Ask which stands.
- "It depends" means the question hid two cases. Split it and ask both.
- "Whatever is standard" means look in the code for the local standard, cite it, and record it as an assumption.
- "You decide" on a question that changes the design: take the first option, record it under Assumptions as your default with the reason, and move on. Don't press for an opinion the user said they don't have.
- When a round of answers changes nothing in your draft, the interview is finished, even if questions remain on this list.
