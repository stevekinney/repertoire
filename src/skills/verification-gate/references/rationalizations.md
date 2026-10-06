# Rationalizations for skipping the gate

Read this when you notice yourself reaching for a reason not to run the proof, not to read it, or not to open the diff. Find the one you're using. Each has the same shape: the excuse feels reasonable, and the rebuttal says what it costs the user.

| You're thinking | What's wrong with it | Do instead |
| --- | --- | --- |
| "I ran the tests a few minutes ago." | The edit you made since then is exactly the one most likely to break them. Old output proves the old tree. | Run again now. It's one command. |
| "The change is trivial; it can't break anything." | Trivial changes break imports, formatting checks, snapshot tests, and type inference. "Can't" is a hedge in disguise. | Run the fastest relevant check and read its summary. |
| "The exit code was 0." | Exit 0 with `No tests found`, `0 passed`, or a skipped suite is not passing. A watcher that was killed also exits 0. | Read the summary line and the counts. |
| "I only need to run the one file I changed." | That proves the file, not the claim. The claim is usually about the suite, and the break is usually elsewhere. | Run what the claim covers. Narrow the claim if you narrow the run, and say so. |
| "The code is obviously correct; I can see it." | Reading code is how the bug got in. Evidence is output from running it, not confidence from reading it. | Reproduce the bug, then show the reproduction passing. |
| "The user is in a hurry." | A false "done" costs them more time than a fresh run, because they'll act on it before finding out. | Run it. Report honestly if it fails. |
| "I'll mention that I didn't run it." | A claim with a disclaimer still reads as a claim. The user remembers "done", not the footnote. | Move it to unverified and lead with that. |
| "It would pass if the environment were set up." | Then it's unverified, with a reason. A guess about a different environment isn't evidence from this one. | Report it as unverified, with the error and the unblocking step. |
| "The subagent said it finished." | The subagent's report is its own claim, graded by itself. | Read its diff, run the checks on it, or send it to `repertoire:referee`. |
| "The diff is long; I know what's in it." | The leftover `console.log`, the `.only`, the deleted test, and the file you forgot are all in the part you didn't reread. | Read every hunk. |
| "Rerunning will just show the same thing." | If you're sure, it costs one command. If you're wrong, it's the one that matters. | Run it. |
| "Verification is the reviewer's job." | A reviewer catches a false done after the user has read it. The claim comes from here, so the check happens here. | Verify before the claim leaves the session. |
| "I'll fix that one failing test later." | A claim of passing with a known failure is false. Later tends not to arrive. | Report it under failed, or fix it and rerun the gate. |
| "The assertion was wrong, so I updated it." | Sometimes true. More often, the code is wrong and the test was right, and the diff now hides it. | Explain in the report why the old assertion was wrong, with the evidence. |

If none of these fits, write the excuse down in one sentence and put it in the report under unverified. An excuse that can't be written down is one you shouldn't act on.
