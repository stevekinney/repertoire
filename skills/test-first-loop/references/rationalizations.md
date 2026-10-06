# Rationalizations

Each entry is the argument as you'll phrase it to yourself, why it doesn't hold, and what to do instead. Read this at the moment you're reasoning toward skipping a step, not before.

**"This is too simple to need a test."**
Simple code is where the cheapest test lives and where "obviously correct" code ships with an off-by-one. If it's simple, the test takes a minute. Write it.

**"I'll write the test right after the code."**
A test written after the code checks what the code does, and the code is right there telling you what to assert. The order is the mechanism. Write the test first, or delete the code and write it first.

**"I need to see the code to know what to test."**
You need to see the interface and the requirement, not the implementation. If you can't name the input and the expected outcome, the behavior isn't understood yet, and that's the problem to fix before writing code. Restate the behavior or ask.

**"The test would just duplicate the code."**
A test that mirrors the implementation is testing through the wrong boundary. Move up to the public interface and assert the outcome a caller cares about. If no outcome exists that a caller can observe, question whether the code is needed.

**"There's no test harness here, so I'll skip it this once."**
Skipping it is a decision the user owns. Stop and ask whether to add a runner, with the command and what it installs.

**"The surrounding code isn't tested either."**
That's a reason the surrounding code is risky, not a reason to add to it. Test the behavior you're adding through its public interface. Leave the rest alone unless the user asks you to pin it.

**"Deleting the code wastes the work I did."**
The work that matters is the test and the understanding behind it. Rewriting the implementation against a red test usually takes less time than the first draft did, and the result is checked. Delete it.

**"I'll keep it as a reference while I write the test."**
Reading the implementation while writing its test produces a test that matches the implementation. That's the exact failure this skill exists to prevent. Remove the hunk, then write the test.

**"It's just a refactor, the behavior doesn't change."**
Then a test can prove it. Pin the current behavior with a test that passes before the refactor, and keep it green through the change. A refactor without that is a rewrite with a hopeful name.

**"This is a spike; I'm just exploring."**
Exploration is fine when the user called it that and the code won't be kept. If the spike turns into the implementation, it's code before the test: delete it and write the test from what the spike taught you. Ask when it's unclear which one this is.

**"The test passed on the first try, so the behavior must be right."**
A test that was never red has proved nothing about the implementation. It may be asserting something trivial, testing the wrong file, or covering behavior that already existed. Find out which before moving on.

**"I'll mock this collaborator to make the test easier."**
A mocked internal collaborator pins the current structure and fails on the next refactor without the behavior changing. Keep in-process collaborators real and fake only process edges, unless the project's existing tests show a different convention.
