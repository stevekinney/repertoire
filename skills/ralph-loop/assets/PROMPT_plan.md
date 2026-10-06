Compare the specs to the code and write the plan. Do not implement anything.

## Read

1. `CLAUDE.md`, for how the project builds and tests.
2. Every file under `specs/`. Each one describes one topic of the system's behavior.
3. The code. Search for what each spec describes before deciding it is missing. The most common planning error is a task for something that already exists under another name.
4. `claude-progress.md` (<!-- EDIT: the project's progress file, as CLAUDE.md names it -->), if it exists, for decisions already made.

## Write `IMPLEMENTATION_PLAN.md`

A Markdown list in the order the work should happen. Each item:

```
- [ ] <one sentence, no "and"> (spec: <file>; done when: <a check a script can run>)
```

Rules for the list:

- One sentence per task, without the word "and". If you need it, split the task.
- Every task names the spec it comes from and the observable check that proves it. "Tests pass" is not a check unless you name the test.
- Order by dependency, then by risk: the task most likely to reveal a wrong assumption goes first.
- Leave out anything the code already does. Say what you found instead, in a short "Already present" section under the list.
- Put decisions the specs do not settle in an "Open questions" section at the end, and do not plan tasks that depend on them. A person answers those before the loop runs.
- Do not estimate, prioritize by business value, or write prose about approach. The plan is a queue, not a design document.

Do not touch any other file. Do not commit.
