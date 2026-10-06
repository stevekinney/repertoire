---
type: llm
weight: 2
---
The answer carries out the dossier procedure rather than just asking for more or answering from guesses. It pulls search terms from the ticket (PAY-482, `refund-service.ts`, the 422 error, refunds over $500, EU, manual review, dana and omar) and sets a date window starting around the ticket's creation. It checks which sources (tracker, chat, meeting notes, git history) are actually connected and records unconnected ones as skipped rather than substituting a web search. It plans to stage each source and search them in parallel with separate searchers, and it names a default output file such as `dossier-PAY-482.md`. It does not start the ticket's work, edit code, or comment on the ticket.
