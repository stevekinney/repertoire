#!/usr/bin/env bash
# Ralph loop: a fresh agent for one small task, progress on disk, repeat.
#
# Five parts: measure (the oracle), pick (the queue), run (the agent), accept
# (keep or discard), and the governor (whatever forces a stop). The agent
# controls only run(). Everything else belongs to this script.
#
# Fill in every section marked EDIT. Each limit needs a real number; the script
# refuses to start while one is missing or zero.
#
# Exit codes, typed so a supervisor can tell them apart:
#   0  success   the oracle says the work is done
#   1  failure   a cap, a stall, a repeated failure, or an empty queue stopped it first
#   2  blocked   the agent reported it cannot proceed (see BLOCKED_MARKER)
#   3  broken    the loop's own machinery failed: a missing binary, measure() threw
#   4  stopped   the stop file existed at the start of an iteration
#
# Layout, all under $RALPH_DIR (default .ralph/, excluded from git by preflight):
#   STOP            create it to end the loop cleanly after the current iteration
#   log.tsv         one line per iteration, with the session_id of that run
#   attempts/NNNN/  result.json, stderr.log, diff.patch, measure-*.tsv per attempt
#   work/           the disposable checkout for the current attempt
#   lock/           held while a loop runs; one build at a time per repository
set -euo pipefail

# --- EDIT: limits ------------------------------------------------------------
# Ceilings for one run of this script. Start with MAX_ITERATIONS=1, then a
# handful; the first 10 to 15 percent of the budget buys information, not work.
MAX_ITERATIONS=${MAX_ITERATIONS:-20}              # fresh agents per run; 0 is refused
MAX_TOTAL_USD=${MAX_TOTAL_USD:-25}                # sum of total_cost_usd across iterations
MAX_WALL_SECONDS=${MAX_WALL_SECONDS:-7200}        # the whole run, checked before each iteration
MAX_TURNS_PER_ITERATION=${MAX_TURNS_PER_ITERATION:-30}
MAX_USD_PER_ITERATION=${MAX_USD_PER_ITERATION:-2} # passed to --max-budget-usd
MAX_STALLS=${MAX_STALLS:-3}                       # consecutive iterations with no kept improvement
MAX_REPEATED_FAILURES=${MAX_REPEATED_FAILURES:-2} # the same rejection reason, back to back

# --- EDIT: agent -------------------------------------------------------------
PROMPT_FILE=${PROMPT_FILE:-PROMPT_build.md}        # identical every iteration; the task lives in TASK_FILE
TASK_FILE=${TASK_FILE:-.ralph/TASK.md}             # pick() writes one task here, inside the checkout
MODEL=${MODEL:-}                                   # empty: the account's default
# Comma-separated. Keep it to what the task needs. Nothing irreversible.
ALLOWED_TOOLS=${ALLOWED_TOOLS:-"Read,Edit,Write,Grep,Glob,Bash(git diff *),Bash(git status *)"}
# Enforced by the harness, not by the prompt: no push, merge, issue, or network.
DISALLOWED_TOOLS=${DISALLOWED_TOOLS:-"Bash(git push *),Bash(git merge *),Bash(git rebase *),Bash(gh *),WebFetch,WebSearch"}
# The agent starts its final message with this when it cannot proceed.
BLOCKED_MARKER=${BLOCKED_MARKER:-"BLOCKED:"}

# --- EDIT: veto list ---------------------------------------------------------
# Space-separated globs of paths the agent may never change. A match discards
# the attempt. Add the test directory for a migration or type-error loop; leave
# it out for a coverage campaign, where writing tests is the task.
VETO_PATHS=${VETO_PATHS:-"PROMPT_*.md loop.sh specs/* CLAUDE.md AGENTS.md"}

# --- EDIT: measure -----------------------------------------------------------
# The oracle. Runs the checks in the checkout at $1 and prints one line:
#   <integer score>TAB<facts>
# Higher is better, and "done" is the maximum: use the negative of the error
# count. Fail closed: prove each binary exists, keep `set -e` semantics, and
# never `|| true` the check itself. A missing `tsc` must not read as zero errors.
measure() {
  local dir=$1
  die_broken "measure() is not filled in; see step 2 of the ralph-loop skill"
  # Sample, type-error burn-down:
  #   (cd "$dir" && npx tsc --version >/dev/null) || return 1
  #   local errors
  #   errors=$(cd "$dir" && { npx tsc --noEmit --pretty false 2>&1 || true; } | grep -c 'error TS')
  #   printf '%s\t%s\n' "$(( -errors ))" "type_errors=$errors"
}

# --- EDIT: pick --------------------------------------------------------------
# The queue. Given the checkout at $1 and the facts from measure() in $2, prints
# one task, or nothing when the queue is empty. Derive the task from the work
# itself where possible (the first file not yet ported, the first failing check)
# so the queue survives losing its state file.
pick() {
  local dir=$1 facts=$2
  die_broken "pick() is not filled in; see step 3 of the ralph-loop skill"
  # Sample, plan-file queue:
  #   grep -m1 '^- \[ \] ' "$dir/IMPLEMENTATION_PLAN.md" | sed 's/^- \[ \] //'
}

# --- EDIT: done --------------------------------------------------------------
# True when the score means the run is finished.
is_done() {
  [ "$1" -ge 0 ]
}

# --- layout and helpers ------------------------------------------------------
RALPH_DIR=${RALPH_DIR:-.ralph}
STOP_FILE="$RALPH_DIR/STOP"
LOG_FILE="$RALPH_DIR/log.tsv"
ATTEMPTS_DIR="$RALPH_DIR/attempts"
WORK_DIR="$RALPH_DIR/work"
LOCK_DIR="$RALPH_DIR/lock"
BRANCH=${BRANCH:-ralph}                            # the loop's branch; a person merges it

log() { printf 'ralph: %s\n' "$*" >&2; }
die_broken() { log "broken: $*"; exit 3; }
is_blocked() { case "$1" in "$BLOCKED_MARKER"*) return 0 ;; esac; return 1; }
number_ge() { node -e 'process.exit(Number(process.argv[1]) >= Number(process.argv[2]) ? 0 : 1)' "$1" "$2"; }
number_add() { node -e 'process.stdout.write(String(Number(process.argv[1]) + Number(process.argv[2] || 0)))' "$1" "$2"; }

# Reads one field from the JSON result. Prints nothing when it is missing, so
# the caller decides what that means.
result_field() {
  node -e '
    const [file, key] = process.argv.slice(1);
    let json; try { json = JSON.parse(require("fs").readFileSync(file, "utf8")); } catch { process.exit(0); }
    const v = json[key]; if (v !== undefined && v !== null) process.stdout.write(String(v));
  ' "$1" "$2"
}

# --- governor: preflight -----------------------------------------------------
preflight() {
  command -v claude >/dev/null || die_broken "claude is not on PATH"
  command -v node >/dev/null || die_broken "node is required to parse the JSON result"
  command -v git >/dev/null || die_broken "git is not on PATH"
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die_broken "not inside a git repository"
  [ -f "$PROMPT_FILE" ] || die_broken "prompt file $PROMPT_FILE does not exist"

  if [ -n "${ANTHROPIC_API_KEY:-}" ] && [ "${RALPH_ALLOW_API_KEY:-}" != "1" ]; then
    die_broken "ANTHROPIC_API_KEY is set, so every iteration would bill the API instead of a subscription. Unset it, or set RALPH_ALLOW_API_KEY=1 on purpose."
  fi

  local v
  for v in MAX_ITERATIONS MAX_TOTAL_USD MAX_WALL_SECONDS MAX_TURNS_PER_ITERATION MAX_USD_PER_ITERATION MAX_STALLS MAX_REPEATED_FAILURES; do
    case "${!v}" in
      ''|*[!0-9.]*) die_broken "$v must be a number, got '${!v}'" ;;
      0|0.0|0.00) die_broken "$v is 0. There is no 'unlimited'; set a real ceiling." ;;
    esac
  done

  if [ "$(git branch --show-current)" = "$BRANCH" ]; then
    die_broken "the current checkout is on $BRANCH; run the loop from another branch so accepted commits don't move under you"
  fi

  mkdir -p "$RALPH_DIR" "$ATTEMPTS_DIR"
  local exclude
  exclude="$(git rev-parse --git-common-dir)/info/exclude"
  grep -qx "$RALPH_DIR/" "$exclude" 2>/dev/null || printf '%s/\n' "$RALPH_DIR" >>"$exclude"

  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    die_broken "another loop holds $LOCK_DIR; wait for it, or remove the directory if that loop is dead"
  fi
  trap 'rm -rf "$LOCK_DIR"' EXIT

  git show-ref --verify --quiet "refs/heads/$BRANCH" || git branch "$BRANCH"
  [ -f "$LOG_FILE" ] || printf 'timestamp\tattempt\tsession_id\toutcome\tscore_before\tscore_after\tcost_usd\ttask\n' >"$LOG_FILE"
}

# --- disposable checkout -----------------------------------------------------
# Each attempt runs in a worktree made from the last accepted commit. Discarding
# the worktree removes tracked edits and new files alike; `git reset --hard`
# does not, which is why this is not a reset.
fresh_checkout() {
  discard_checkout
  git worktree add --quiet --detach "$WORK_DIR" "$BRANCH"
}

discard_checkout() {
  [ -d "$WORK_DIR" ] || return 0
  git worktree remove --force "$WORK_DIR" 2>/dev/null || rm -rf "$WORK_DIR"
  git worktree prune
}

# --- run ---------------------------------------------------------------------
# The only part the agent controls. Writes claude's JSON result to the attempt
# directory. A non-zero exit from claude is recorded, not fatal: the result's
# subtype says what happened, and accept() rejects anything but success.
run_agent() {
  local dir=$1 attempt_dir=$2
  local -a args=(-p --output-format json
    --max-turns "$MAX_TURNS_PER_ITERATION"
    --max-budget-usd "$MAX_USD_PER_ITERATION"
    --allowedTools "$ALLOWED_TOOLS"
    --disallowedTools "$DISALLOWED_TOOLS")
  [ -n "$MODEL" ] && args+=(--model "$MODEL")
  local prompt
  prompt=$(cat "$PROMPT_FILE")
  (cd "$dir" && claude "${args[@]}" "$prompt") >"$attempt_dir/result.json" 2>"$attempt_dir/stderr.log" || true
}

# --- accept ------------------------------------------------------------------
# Prints each changed path that matches the veto list. Globbing is off so the
# patterns match paths, not files in the current directory.
vetoed_paths() {
  local changed=$1 path pattern
  set -f
  printf '%s\n' "$changed" | while IFS= read -r path; do
    [ -n "$path" ] || continue
    for pattern in $VETO_PATHS; do
      # shellcheck disable=SC2254 # the pattern is meant to glob
      case "$path" in $pattern) printf '%s\n' "$path"; break ;; esac
    done
  done
  set +f
}

# --- the loop ----------------------------------------------------------------
main() {
  preflight
  local started_at iteration=0 total_usd=0 stalls=0 repeats=0 last_reason=""
  started_at=$(date +%s)

  while :; do
    # governor
    if [ -f "$STOP_FILE" ]; then log "stop file $STOP_FILE exists; exiting cleanly"; exit 4; fi
    iteration=$((iteration + 1))
    if [ "$iteration" -gt "$MAX_ITERATIONS" ]; then log "cap: MAX_ITERATIONS=$MAX_ITERATIONS reached"; exit 1; fi
    if [ $(( $(date +%s) - started_at )) -ge "$MAX_WALL_SECONDS" ]; then log "cap: MAX_WALL_SECONDS=$MAX_WALL_SECONDS reached"; exit 1; fi
    if number_ge "$total_usd" "$MAX_TOTAL_USD"; then log "cap: MAX_TOTAL_USD=$MAX_TOTAL_USD reached (spent $total_usd)"; exit 1; fi

    local attempt_dir attempt_no
    attempt_no=$(( $(ls "$ATTEMPTS_DIR" | wc -l) + 1 ))
    attempt_dir="$ATTEMPTS_DIR/$(printf '%04d' "$attempt_no")"
    mkdir -p "$attempt_dir"
    fresh_checkout

    # measure, failing closed
    local before score_before facts
    before=$(measure "$WORK_DIR") || die_broken "measure() failed before iteration $iteration; the checkout is kept at $WORK_DIR for inspection"
    score_before=${before%%$'\t'*}; facts=${before#*$'\t'}
    printf '%s\n' "$before" >"$attempt_dir/measure-before.tsv"
    if is_done "$score_before"; then log "done: score $score_before ($facts)"; discard_checkout; exit 0; fi

    # pick
    local task
    task=$(pick "$WORK_DIR" "$facts") || die_broken "pick() failed before iteration $iteration"
    if [ -z "$task" ]; then log "queue empty, oracle not satisfied: score $score_before ($facts)"; discard_checkout; exit 1; fi
    mkdir -p "$WORK_DIR/$(dirname "$TASK_FILE")"
    printf '%s\n' "$task" >"$WORK_DIR/$TASK_FILE"

    # run
    run_agent "$WORK_DIR" "$attempt_dir"
    local session_id cost subtype result_text
    session_id=$(result_field "$attempt_dir/result.json" session_id)
    cost=$(result_field "$attempt_dir/result.json" total_cost_usd)
    subtype=$(result_field "$attempt_dir/result.json" subtype)
    result_text=$(result_field "$attempt_dir/result.json" result)
    [ -n "$session_id" ] || die_broken "no session_id in $attempt_dir/result.json; see $attempt_dir/stderr.log"
    total_usd=$(number_add "$total_usd" "$cost")

    # record the attempt before judging it
    local changed
    (cd "$WORK_DIR" && git add -A)
    changed=$(cd "$WORK_DIR" && git diff --cached --name-only)
    (cd "$WORK_DIR" && git diff --cached) >"$attempt_dir/diff.patch"

    # accept: blocked, then the veto list, then the agent's own outcome, then the oracle
    local outcome="rejected" reason="" score_after="" vetoed
    vetoed=$(vetoed_paths "$changed")
    if is_blocked "$result_text"; then
      reason="blocked"
    elif [ -n "$vetoed" ]; then
      reason="veto:$(printf '%s' "$vetoed" | tr '\n' ',')"
    elif [ "$subtype" != "success" ]; then
      reason="agent:${subtype:-no-result}"
    elif [ -z "$changed" ]; then
      reason="no-change"
    else
      local after
      if after=$(measure "$WORK_DIR"); then
        score_after=${after%%$'\t'*}
        printf '%s\n' "$after" >"$attempt_dir/measure-after.tsv"
        if [ "$score_after" -gt "$score_before" ]; then outcome="accepted"
        elif [ "$score_after" -eq "$score_before" ]; then reason="no-improvement"
        else reason="score-dropped"; fi
      else
        reason="oracle-failed"
      fi
    fi

    if [ "$outcome" = "accepted" ]; then
      (cd "$WORK_DIR" && git -c user.name=ralph -c user.email=ralph@localhost commit --quiet -m "ralph: $task" -m "session: $session_id")
      git update-ref "refs/heads/$BRANCH" "$(git -C "$WORK_DIR" rev-parse HEAD)"
      stalls=0; repeats=0; last_reason=""
    else
      outcome="rejected:$reason"
      stalls=$((stalls + 1))
      if [ "$reason" = "$last_reason" ]; then repeats=$((repeats + 1)); else repeats=1; last_reason=$reason; fi
    fi

    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$attempt_no" "$session_id" "$outcome" "$score_before" "$score_after" "$cost" "$task" >>"$LOG_FILE"
    log "iteration $iteration: $outcome (score $score_before -> ${score_after:-n/a}, \$${cost:-?}, session $session_id)"
    discard_checkout

    if [ "$reason" = "blocked" ]; then log "the agent reported it is blocked; see $attempt_dir/result.json"; exit 2; fi
    if [ "$stalls" -ge "$MAX_STALLS" ]; then log "stall: $stalls iterations without a kept improvement"; exit 1; fi
    if [ "$repeats" -ge "$MAX_REPEATED_FAILURES" ]; then log "repeated failure: '$reason' $repeats times in a row"; exit 1; fi
  done
}

# Subcommands run one part alone, for the proofs in the skill. Only a bare invocation starts the loop:
# a mistyped subcommand must never fall through into real iterations.
case "${1:-}" in
  measure) measure "$2"; exit $? ;;
  pick) pick "$2" "$3"; exit $? ;;
  "") main ;;
  *) echo "ralph: broken: unknown subcommand '$1' (expected: measure <dir> | pick <dir> <facts> | no arguments)" >&2; exit 3 ;;
esac
