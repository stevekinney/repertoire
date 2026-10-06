# Progress

Append-only. Each session reads this file first and adds one entry at the end before it stops. Never edit or summarize an earlier entry; the dead ends are the most valuable part. Every claim carries the date it was last verified; an undated claim is a lead, not a fact.

Feature order: `feature_list.json` is ordered by priority. Take the first entry with `"passes": false` unless an entry below says otherwise and why.

---

## <YYYY-MM-DD> Baseline (project-initializer)

**Done**

- Start script `init.sh`: verified <YYYY-MM-DD>, `<command>` exit 0, ready line `<verbatim>`.
- Smoke check `smoke.sh`: verified <YYYY-MM-DD>. Seen failing against a stopped app (exit `<code>`), seen passing against a running one (exit 0, last line `<verbatim>`).
- `CLAUDE.md` commands section: every row run this session.
- `feature_list.json`: <N> entries, all `"passes": false`, reviewed by the user.

**Decisions**

- <What the user cut from the feature list, and why.>
- <What "working" means for this project, in one sentence, and why that sentence and not a bigger one.>
- <Any convention chosen where the project had none, such as where the smoke check lives.>

**Tried and abandoned**

- <Anything that didn't work on the way to the baseline, with the reason, or "nothing".>

**Not verified**

- <Commands or services that couldn't be run in this session, with the error, or "nothing".>

**Next**

- Take the first entry in `feature_list.json`: `<its description>`. No feature code exists yet; this commit is the baseline to roll back to.
