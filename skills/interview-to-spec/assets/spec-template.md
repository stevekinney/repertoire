# [[Feature name]]

Status: [[Draft | Approved]]
Written: [[YYYY-MM-DD]] at revision [[output of `git rev-parse --short HEAD`, or "None (not a git repository)"]]

## Summary

[[One paragraph: what changes for the user, and why now. Written for someone who has never seen the conversation that produced this spec.]]

## Who it is for

[[The person or system that uses this, and what they do today instead.]]

## In scope

- [[Each behavior this spec commits to, one per line.]]

## Out of scope

- [[Each thing a reader might expect that this spec deliberately excludes, with a one-line reason so it isn't re-added "while we're here". Write "None" only if the user confirmed there is nothing to exclude.]]

## Behavior

### Normal case

[[Step by step, from the user's or caller's point of view.]]

### Edges

| Case | Behavior |
| --- | --- |
| Empty or missing input | [[...]] |
| Duplicate or repeated request | [[...]] |
| Failure partway through | [[...]] |
| Unauthorized or wrong caller | [[...]] |
| Concurrent use | [[...]] |
| [[Other edge specific to this feature]] | [[...]] |

## Files and interfaces

[[Each existing file, module, or interface this touches, by path at the revision above. New files are marked "(proposed)". Public signatures, routes, schema changes, or config keys are written out, not described.]]

- `[[path/to/existing/file]]`: [[what changes]]
- `[[path/to/new/file]]` (proposed): [[what it holds]]

## Assumptions

[[Decisions made without an explicit answer from the user. Each is labeled with who chose it ("agent default" or "user: no opinion") and why. The user may strike any of these.]]

- [[Assumption]] (agent default: [[reason]])

## Open questions

[[Questions the interview did not settle. Each carries the default the implementer takes if nobody answers before implementation.]]

- [[Question]] (default: [[what to do]])

## Acceptance criteria

[[Each criterion is observable: a command and its expected output, a request and its response, or steps and the visible result. A reader with no context can check each one and say met or not met.]]

1. [[`command`]] exits 0 and prints [[expected output]].
2. [[Request]] returns [[response]].
3. [[Steps]] show [[visible result]].

## End-to-end verification

[[One sequence from a clean checkout to the observed behavior, including the test command the project already uses. This is what decides done.]]

1. [[step]]
2. [[step]]
