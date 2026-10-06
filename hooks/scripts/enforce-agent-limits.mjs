#!/usr/bin/env node
// src/hooks/enforce-agent-limits.ts
import { readFileSync } from "node:fs";

// src/hooks/lib/agent-limits.ts
var PLUGIN_PREFIX = "repertoire:";
var OBSERVERS = new Set([
  "referee",
  "antagonist",
  "archaeologist",
  "conspiracy-theorist",
  "self-improvement-junkie",
  "scout",
  "new-hire",
  "judge"
]);
var TEST_ONLY_WRITERS = new Set(["reenactor", "test-designer"]);
var GIT_MUTATING = ["add", "am", "apply", "checkout", "cherry-pick", "clean", "commit", "merge", "rebase", "reset", "restore", "revert", "stash", "switch", "tag"];
var EXTERNAL_EFFECTS = [
  { pattern: /\bgh\s+(?:pr|issue|release|repo)\s+(?:merge|create|close|reopen|comment|review|edit|delete)\b/, what: "a gh command that changes GitHub" },
  { pattern: /\b(?:npm|pnpm|yarn|bun)\s+publish\b/, what: "a package publish" },
  { pattern: /\bcurl\b[^|;&]*\s(?:-X|--request)\s*(?:POST|PUT|PATCH|DELETE)\b/i, what: "a mutating HTTP request" }
];
var WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
var PATH_WRITING_VERBS = new Set(["rm", "mv", "cp", "tee", "touch", "mkdir", "install", "truncate", "chmod", "ln"]);
function agentName(agentType) {
  if (!agentType?.startsWith(PLUGIN_PREFIX))
    return;
  return agentType.slice(PLUGIN_PREFIX.length);
}
function isTestPath(path) {
  const normalized = path.replaceAll("\\", "/");
  return /(^|\/)(tests?|__tests__|spec|specs|e2e|__snapshots__|fixtures|__fixtures__)\//.test(normalized) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized) || /(^|\/)test_[^/]+\.py$/.test(normalized) || /_test\.(go|py|rb|rs)$/.test(normalized) || /Tests?\.(java|kt|cs|swift)$/.test(normalized);
}
function isScratchPath(path) {
  return /^(\/dev\/null|\/tmp\/|\/private\/tmp\/|\/var\/folders\/)/.test(path) || path === "/dev/stderr" || path === "/dev/stdout";
}
function simpleCommands(command) {
  return command.split(/&&|\|\||[;|\n]/).map((part) => part.trim()).filter(Boolean);
}
function words(command) {
  return command.match(/"[^"]*"|'[^']*'|\S+/g)?.map((word) => word.replace(/^["']|["']$/g, "")) ?? [];
}
function gitVerb(tokens) {
  const index = tokens.indexOf("git");
  if (index === -1)
    return;
  for (let i = index + 1;i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "-C" || token === "-c" || token === "--git-dir" || token === "--work-tree") {
      i++;
      continue;
    }
    if (token.startsWith("-"))
      continue;
    return token;
  }
  return;
}
function redirectTargets(command) {
  const targets = [];
  for (const match of command.matchAll(/(?:^|[^<>&\d])(?:\d?)>{1,2}\s*([^\s&|;<>]+)/g))
    targets.push(match[1].replace(/^["']|["']$/g, ""));
  return targets;
}
function deny(reason) {
  return { deny: true, reason };
}
function bashDecision(name, command) {
  const commands = simpleCommands(command);
  if (commands.some((simple) => gitVerb(words(simple)) === "push")) {
    return deny(`repertoire:${name} may not run git push. Its effects leave this machine, so a person does that step. Report what you would have done instead.`);
  }
  for (const { pattern, what } of EXTERNAL_EFFECTS) {
    if (pattern.test(command)) {
      return deny(`repertoire:${name} may not run ${what}. Its effects leave this machine, so a person does that step. Report what you would have done instead.`);
    }
  }
  const observer = OBSERVERS.has(name);
  const testOnly = TEST_ONLY_WRITERS.has(name);
  if (!observer && !testOnly)
    return;
  for (const simple of commands) {
    const tokens = words(simple);
    const verb = gitVerb(tokens);
    if (verb !== undefined && GIT_MUTATING.includes(verb)) {
      const judgeInWorktree = name === "judge" && (verb === "checkout" || verb === "switch") && tokens.includes("--detach");
      if (!judgeInWorktree) {
        return deny(`repertoire:${name} is read-only toward the repository, so \`git ${verb}\` is not allowed. Inspect with git log, diff, show, blame, or status, and report what needs changing.`);
      }
    }
    if (observer) {
      if (/\bsed\s+(?:-\S*i|--in-place)/.test(simple) || /\bperl\s+(?:-\S*i)/.test(simple)) {
        return deny(`repertoire:${name} is read-only; in-place edits are not allowed.`);
      }
      const targets = [...redirectTargets(simple), ...PATH_WRITING_VERBS.has(tokens[0] ?? "") ? tokens.slice(1).filter((t) => !t.startsWith("-")) : []];
      const outside = targets.filter((target) => !isScratchPath(target));
      if (outside.length > 0) {
        return deny(`repertoire:${name} is read-only toward the repository; it may only write to scratch space (/tmp). Not allowed: ${outside.join(", ")}.`);
      }
    }
    if (testOnly) {
      if (/\bsed\s+(?:-\S*i|--in-place)/.test(simple) || /\bperl\s+(?:-\S*i)/.test(simple)) {
        const files = tokens.slice(1).filter((t) => !t.startsWith("-") && /[./]/.test(t));
        const outside = files.filter((file) => !isTestPath(file) && !isScratchPath(file));
        if (outside.length > 0)
          return deny(`repertoire:${name} may write test files only. In-place edit of ${outside.join(", ")} is not allowed.`);
      }
      const targets = [...redirectTargets(simple), ...PATH_WRITING_VERBS.has(tokens[0] ?? "") ? tokens.slice(1).filter((t) => !t.startsWith("-")) : []];
      const outside = targets.filter((target) => !isTestPath(target) && !isScratchPath(target));
      if (outside.length > 0) {
        return deny(`repertoire:${name} may write test files only. Not allowed: ${outside.join(", ")}. If the fix belongs in application code, report it as a finding instead.`);
      }
    }
  }
  return;
}
function writeDecision(name, toolName, toolInput) {
  if (!TEST_ONLY_WRITERS.has(name))
    return;
  const target = [toolInput.file_path, toolInput.notebook_path, toolInput.path].find((value) => typeof value === "string");
  if (target === undefined)
    return;
  if (isTestPath(target) || isScratchPath(target))
    return;
  return deny(`repertoire:${name} may write test files only, and ${toolName} on ${target} is not a test file. If the fix belongs in application code, report it as a finding instead.`);
}
function decide(call) {
  const name = agentName(call.agentType);
  if (name === undefined)
    return;
  if (call.toolName === "Bash") {
    const command = call.toolInput.command;
    return typeof command === "string" ? bashDecision(name, command) : undefined;
  }
  if (WRITE_TOOLS.has(call.toolName))
    return writeDecision(name, call.toolName, call.toolInput);
  return;
}

// src/hooks/enforce-agent-limits.ts
function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch (error) {
    process.stderr.write(`enforce-agent-limits: unreadable payload, allowing the call (${String(error)})
`);
    return;
  }
  if (typeof payload !== "object" || payload === null)
    return;
  const input = payload;
  if (input.hook_event_name !== "PreToolUse" || typeof input.tool_name !== "string")
    return;
  const toolInput = typeof input.tool_input === "object" && input.tool_input !== null ? input.tool_input : {};
  const decision = decide({
    agentType: typeof input.agent_type === "string" ? input.agent_type : undefined,
    toolName: input.tool_name,
    toolInput
  });
  if (!decision)
    return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: decision.reason
    }
  }) + `
`);
}
main();
