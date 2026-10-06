# Rationalizations

Read this when you are about to skip a phase of the debugging protocol. Find the sentence you were about to write, then read the rebuttal. If none matches, write your excuse down in one line, and you'll usually see which row it belongs in.

Tells that you're about to skip: "probably", "just", "quick", "obviously", "should work", "let me try", "while I'm here".

| The excuse | Why it fails | Do instead |
| --- | --- | --- |
| "The fix is obvious." | Obvious fixes that were wrong cost the most, because nobody checks them. If it's obvious, reproduction takes a minute and proves it. | Reproduce, confirm the lead in the file, write the test, then fix. The quick path is still the protocol. |
| "I'll just try this and see." | That is phase 3 without a hypothesis. If it passes, you don't know why; if it fails, you've learned nothing you can rule out. | Write the hypothesis and the predicted result before you run anything. |
| "There's no time to reproduce." | You spend that time anyway, verifying the fix. Without a reproduction you can't tell a fix from a coincidence. | Reproduce, or delegate to `repertoire:reenactor` and work on what changed meanwhile. |
| "It's probably X." | Then X is a hypothesis, and "probably" means you have a competing one you haven't named. | Name the competitor and the experiment that separates them. |
| "The test is flaky; rerun it." | Flaky is a diagnosis, and it needs evidence. A failure in one run out of ten is a real bug with a timing component. | Run it ten times, record the ratio, and treat the ordering or timing as a hypothesis. |
| "The error message is misleading." | Sometimes. But you can't know that before reading the whole trace, and the first project frame is rarely misleading. | Read bottom to top, then decide. |
| "There's no similar working code." | There is usually a sibling caller, the library's own tests, or a commit where this code worked. | Check another caller, the library docs and tests, and `git log -S`. |
| "A test first is overkill here." | The test is the reproduction with a name. If you have the reproduction, the test is a few lines. If you don't, you aren't at phase 4. | Convert the reproduction into a test in the project's suite. |
| "Changing several things at once is faster." | You can't tell which change mattered, and the others ship as noise, or as the next bug. | One variable per experiment, one cause per fix. |
| "I'll add a guard so it doesn't crash." | The crash was the evidence. A guard keeps the cause and deletes the evidence, and the bug reappears somewhere quieter. | Find why the value is wrong before deciding what to do with it. |
| "Fix now, investigate later." | Later doesn't arrive. The fix merges and the cause survives. | Investigate now; it's the same work, done once. |
| "The third fix will work." | Two failed fixes mean the diagnosis is wrong, not the patch. The third attempt is the first guess in a new costume. | Stop. Delegate to `repertoire:advisor` with everything tried. |
| "It's a bug in the library." | That is a hypothesis with a specific test: a minimal reproduction outside the project. Most such bugs are a misuse. | Reproduce it in isolation before working around it. |
| "I know this codebase; I don't need to check what changed." | The most recent change is the most common cause, and the check takes a minute. | `git log` since the last known-good state, and the dependency diff. |
| "The user said just make it pass." | They may mean it. They may not know what it costs. Skipping silently takes the decision away from them. | Say in one sentence what you'd skip and the risk, then do what they choose. |
| "The delegate already found it." | A delegate's report is an observation, not a verdict, until you've rerun its command. | Rerun the command it cites, then continue the phase. |
| "This is too small to need a report." | The report is where "unverified" gets written down. Small fixes are the ones that skip it. | Write the four sections. For a one-liner, each is one line. |
