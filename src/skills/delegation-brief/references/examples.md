# Briefs that work, and the one that doesn't

Three briefs for the same situation: a session has reproduced a login bug and wants a worker to find the cause. Paths, commits, and names are samples.

## The false success

```text
Investigate the auth bug we discussed. The session cookie seems to get dropped after a refresh. Look at the auth module and report back what you find.
```

It reads fine to the author, who knows which bug, which cookie, which refresh, and which module. The worker knows none of it, so it will pick a module, define "auth bug" for itself, and return a confident summary of whatever it looked at. Every field is missing: no reproduction, no revision, no scope, no output shape, no stopping condition, and no permission to find nothing, so it will find something.

## The same job, briefed

```text
Assignment:
Determine whether the session cookie is dropped because `refreshSession` in src/auth/session.ts overwrites `Set-Cookie` with an expired value. One hypothesis; a sibling tests the proxy-header hypothesis.

Why separate execution helps:
Independent evaluation and parallel work. Two hypotheses, each with its own experiment; neither needs the other's result.

Inputs and revisions:
Commit 3f9c2a1 (sample) on branch main. Reproduction: `bun test test/auth/refresh.test.ts` fails every run with "expected cookie, got undefined" at test/auth/refresh.test.ts:41. Files: src/auth/session.ts, src/auth/cookies.ts, test/auth/refresh.test.ts.

Scope and non-goals:
Inspect src/auth/ and test/auth/. Do not change source files; probes go in a scratch test you delete. The proxy-header path (src/proxy/) is the sibling's.

Allowed actions and controls:
Read, grep, run the test command and scratch tests. No edits to tracked files, no commits, no network.

Information boundary:
Withheld: the other hypothesis and the session's guess about which is likelier, so the verdict comes from the experiment.

Expected output:
Verdict: confirmed, ruled out, or inconclusive. Then the experiment (prediction, command, exit code, output), the file and line implicated, and any evidence pointing at a different cause. Status: complete, partial, or blocked. No findings and not enough evidence are both acceptable answers.

Stopping condition and budget:
Done when the experiment has run and the verdict follows from its output. Budget: 20 turns. If the reproduction stops failing, stop and report that first.

Parent responsibility:
The main session compares both verdicts and rules; if they disagree, it runs one narrower dispatch rather than picking.
```

Every field could be acted on by someone who has never seen the conversation. The withheld material is named, so the parent knows what the verdict is independent of.

## The fan-out

The sibling's brief differs in exactly three fields: `Assignment` (the proxy-header hypothesis), `Scope and non-goals` (src/proxy/ in, src/auth/ out), and `Information boundary` (the cookie hypothesis withheld). Every other field is pasted verbatim, including the reproduction. A brief that says "same inputs as the other one" leaves the second worker without a reproduction.

Two workers would be wrong here if the second hypothesis only made sense after the first was ruled out. Then it is a second phase, dispatched after the first verdict.

## A workflow instead

If the code were unfamiliar and the symptom far from the cause, the whole investigation goes to `/repertoire:localize-fault` with `report` holding the failure output verbatim, `command` set to `bun test test/auth/refresh.test.ts`, and `scope` set to `["src/auth", "src/proxy"]`. The workflow writes the reenactor's and the theorists' briefs itself; the parent's job is those three arguments and weighing the ranked causes that come back.
