# Plan: <task, one line>

Research: `<path to research.md>` (as reviewed by the user before this plan was written)
Status key: `not started` | `in progress` | `done (<commit or date>)` | `failed (<what the check showed>)`

Update the status line of a phase only after its check passed. This file is the resume point when a session runs out of room.

## Goal

<the observable end state, two or three sentences>

## Non-goals

- <what this plan deliberately leaves alone>

## Approach

<one paragraph: the shape of the change and why, citing research claims by number. Name the alternative considered and why it lost.>

## Phase 1: <title>

Status: not started
Depends on: none
Owns: `path/one`, `path/two`

Changes, in order:

1. `path/one` — <what to add, change, or remove, specific enough that no reading of the author's mind is needed>
2. `path/two` — <...>; model it on `path:line`

Check:

```sh
<command>
```

Passes when: <the output that counts, such as "exit 0 and `12 passed`" or "the new test `name` fails before step 1 and passes after step 2">

## Phase 2: <title>

Status: not started
Depends on: Phase 1
Owns: `path/three`

Changes, in order:

1. `path/three` — <...>

Check:

```sh
<command>
```

Passes when: <...>

## Open questions

<questions only the user could answer and did not, each with the default this plan assumes, or "none">

## Handoff

<one line: how this plan is executed, such as "one phase at a time, in a fresh session, with the full checks after each" or "each phase is a task for /repertoire:worktree-swarm"; each phase above already has owned paths and an acceptance check in the shape that workflow needs>
