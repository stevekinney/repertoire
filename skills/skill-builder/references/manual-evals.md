# Manual eval loop

Read this only when `skill-creator` is not in the session, or it failed partway. It is the smallest loop that still compares a skill against a baseline and grades from artifacts. Everything here runs from the main session; only the trials run in subagents.

## Workspace

Put results beside the skill directory, never inside it, because every file inside a skill ships:

```text
<skill-name>-workspace/
  iteration-1/
    <scenario-name>/
      with_skill/outputs/
      without_skill/outputs/      # or old_skill/ when improving an existing skill
      grades.md
  skill-snapshot/                 # copy of the old version, improvements only
```

Number iterations and never reuse a folder, so a rerun after an interruption adds `iteration-N+1` instead of overwriting evidence.

## Scenarios

Write at least three before polishing the draft, and give each a descriptive folder name:

1. **The normal case.** A prompt a real user would type, with concrete detail (file names, a column, a bit of backstory). Abstract prompts ("format this data") don't exercise anything.
2. **The most common false success.** The case where the model produces something plausible that misses the point the skill exists for. This is the scenario that justifies the skill.
3. **A near-miss.** A prompt that shares vocabulary with the skill but needs something else. It tests the description's "not for" clause.

Each scenario gets two or three assertions that a file, diff, or exit code can settle. Subjective outputs get none; the user grades those by reading them.

## Running a round

Start every trial for the round in the same turn, so with-skill and baseline finish together and neither sees the other. Brief each subagent with only what it needs:

```text
Task: <the scenario prompt, verbatim>
Skill: read <absolute path to SKILL.md> first and follow it   # omit for the baseline
Input files: <paths, or "none">
Save outputs to: <workspace>/iteration-<N>/<scenario>/<with_skill|without_skill>/outputs/
Report: the paths you wrote and the commands you ran, nothing else
```

For a new skill the baseline has no skill. For an improvement, snapshot the old version before editing and point the baseline at the snapshot. Don't let the baseline read the draft by accident: a subagent given the skill's directory as its working directory will find it.

While trials run, write the assertions for each scenario into `grades.md` with a blank result column.

## Grading

Grade from the outputs folder, the diff, and exit codes. The subagent's own report is a list of paths, not evidence. For anything a command can check, run the command. Record each assertion as `pass`, `fail`, or `unverified` with the file or output line that decided it.

Then show the user both outputs for every scenario, side by side, and ask what they'd change. Empty feedback means fine. Their complaints, not the pass count, drive the next revision.

## Revising

- Generalize from the feedback. A fix that only works for these three prompts is overfitting; prefer a reason over a rule, and a rule over a MUST.
- Cut what isn't pulling weight. Read the with-skill transcript for time the skill made the model waste.
- If every with-skill trial wrote the same helper, bundle it as a script.
- Apply the change, run a new iteration, and compare with the previous one.

## Routing check

Execution trials skip the routing question, because the subagent was told to read the skill. Once the procedure is stable, write ten prompts, half should-trigger and half near-miss, and give a fresh subagent only the skill listing (name and description, with the other skills in the session) and one prompt at a time, asking which skill it would load. Tighten the description on the failures. If this can't run, mark routing unverified in the report rather than assuming it works.

## Stopping

Stop when the user is satisfied, or when two consecutive iterations change nothing they care about. If three iterations show no difference from baseline, report that: the skill may be teaching the model what it already does, and the honest fix is to shrink or drop it.
