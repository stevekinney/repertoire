/**
 * The limits that repertoire subagents' bodies describe as "instruction, not boundary", enforced as a
 * PreToolUse decision. A subagent's `tools` allowlist can say which tools it has, but not which paths
 * it may write or which commands it may run; this policy covers that gap.
 *
 * It applies only to calls made by one of this plugin's subagents (the hook payload's `agent_type`),
 * so ordinary sessions and other plugins' agents pass straight through. It is a guardrail against an
 * agent drifting outside its brief, not a sandbox: a determined agent can route around string matching,
 * and the denial message says so rather than pretending otherwise.
 */

export type ToolCall = {
  agentType: string | undefined;
  toolName: string;
  toolInput: Record<string, unknown>;
};

export type Decision = { deny: true; reason: string } | undefined;

const PLUGIN_PREFIX = 'repertoire:';

/** Agents that observe and report. They never change history, the index, or the tracked tree. */
const OBSERVERS = new Set([
  'referee',
  'antagonist',
  'archaeologist',
  'conspiracy-theorist',
  'self-improvement-junkie',
  'scout',
  'new-hire',
  'judge',
]);

/** Agents that may write, but only test files. */
const TEST_ONLY_WRITERS = new Set(['reenactor', 'test-designer']);

/** Git subcommands that change history, the index, or the working tree. */
const GIT_MUTATING = ['add', 'am', 'apply', 'checkout', 'cherry-pick', 'clean', 'commit', 'merge', 'rebase', 'reset', 'restore', 'revert', 'stash', 'switch', 'tag'];

/** Commands every plugin agent is denied, because their effects leave the machine or can't be undone. */
const EXTERNAL_EFFECTS: { pattern: RegExp; what: string }[] = [
  { pattern: /\bgh\s+(?:pr|issue|release|repo)\s+(?:merge|create|close|reopen|comment|review|edit|delete)\b/, what: 'a gh command that changes GitHub' },
  { pattern: /\b(?:npm|pnpm|yarn|bun)\s+publish\b/, what: 'a package publish' },
  { pattern: /\bcurl\b[^|;&]*\s(?:-X|--request)\s*(?:POST|PUT|PATCH|DELETE)\b/i, what: 'a mutating HTTP request' },
];

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** Shell verbs whose arguments are paths being written or removed. */
const PATH_WRITING_VERBS = new Set(['rm', 'mv', 'cp', 'tee', 'touch', 'mkdir', 'install', 'truncate', 'chmod', 'ln']);

export function agentName(agentType: string | undefined): string | undefined {
  if (!agentType?.startsWith(PLUGIN_PREFIX)) return undefined;
  return agentType.slice(PLUGIN_PREFIX.length);
}

/** True for paths that look like test files or live in a test directory. */
export function isTestPath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  return (
    /(^|\/)(tests?|__tests__|spec|specs|e2e|__snapshots__|fixtures|__fixtures__)\//.test(normalized) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized) ||
    /(^|\/)test_[^/]+\.py$/.test(normalized) ||
    /_test\.(go|py|rb|rs)$/.test(normalized) ||
    /Tests?\.(java|kt|cs|swift)$/.test(normalized)
  );
}

/** Scratch space is never application code. */
function isScratchPath(path: string): boolean {
  return /^(\/dev\/null|\/tmp\/|\/private\/tmp\/|\/var\/folders\/)/.test(path) || path === '/dev/stderr' || path === '/dev/stdout';
}

/** Split a shell command into simple commands on `;`, `&&`, `||`, `|` and newlines. Quoting is not modeled. */
function simpleCommands(command: string): string[] {
  return command
    .split(/&&|\|\||[;|\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function words(command: string): string[] {
  return command.match(/"[^"]*"|'[^']*'|\S+/g)?.map((word) => word.replace(/^["']|["']$/g, '')) ?? [];
}

function gitVerb(tokens: string[]): string | undefined {
  const index = tokens.indexOf('git');
  if (index === -1) return undefined;
  for (let i = index + 1; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === '-C' || token === '-c' || token === '--git-dir' || token === '--work-tree') {
      i++;
      continue;
    }
    if (token.startsWith('-')) continue;
    return token;
  }
  return undefined;
}

/** Targets of output redirections in one simple command, such as `> out.txt` or `2>>log`. */
function redirectTargets(command: string): string[] {
  const targets: string[] = [];
  for (const match of command.matchAll(/(?:^|[^<>&\d])(?:\d?)>{1,2}\s*([^\s&|;<>]+)/g)) targets.push(match[1]!.replace(/^["']|["']$/g, ''));
  return targets;
}

function deny(reason: string): Decision {
  return { deny: true, reason };
}

function bashDecision(name: string, command: string): Decision {
  const commands = simpleCommands(command);

  if (commands.some((simple) => gitVerb(words(simple)) === 'push')) {
    return deny(`repertoire:${name} may not run git push. Its effects leave this machine, so a person does that step. Report what you would have done instead.`);
  }

  for (const { pattern, what } of EXTERNAL_EFFECTS) {
    if (pattern.test(command)) {
      return deny(`repertoire:${name} may not run ${what}. Its effects leave this machine, so a person does that step. Report what you would have done instead.`);
    }
  }

  const observer = OBSERVERS.has(name);
  const testOnly = TEST_ONLY_WRITERS.has(name);
  if (!observer && !testOnly) return undefined;

  for (const simple of commands) {
    const tokens = words(simple);
    const verb = gitVerb(tokens);

    if (verb !== undefined && GIT_MUTATING.includes(verb)) {
      // The judge runs candidates in a throwaway detached worktree, so it may check out inside one.
      const judgeInWorktree = name === 'judge' && (verb === 'checkout' || verb === 'switch') && tokens.includes('--detach');
      if (!judgeInWorktree) {
        return deny(`repertoire:${name} is read-only toward the repository, so \`git ${verb}\` is not allowed. Inspect with git log, diff, show, blame, or status, and report what needs changing.`);
      }
    }

    if (observer) {
      if (/\bsed\s+(?:-\S*i|--in-place)/.test(simple) || /\bperl\s+(?:-\S*i)/.test(simple)) {
        return deny(`repertoire:${name} is read-only; in-place edits are not allowed.`);
      }
      const targets = [...redirectTargets(simple), ...(PATH_WRITING_VERBS.has(tokens[0] ?? '') ? tokens.slice(1).filter((t) => !t.startsWith('-')) : [])];
      const outside = targets.filter((target) => !isScratchPath(target));
      if (outside.length > 0) {
        return deny(`repertoire:${name} is read-only toward the repository; it may only write to scratch space (/tmp). Not allowed: ${outside.join(', ')}.`);
      }
    }

    if (testOnly) {
      if (/\bsed\s+(?:-\S*i|--in-place)/.test(simple) || /\bperl\s+(?:-\S*i)/.test(simple)) {
        const files = tokens.slice(1).filter((t) => !t.startsWith('-') && /[./]/.test(t));
        const outside = files.filter((file) => !isTestPath(file) && !isScratchPath(file));
        if (outside.length > 0) return deny(`repertoire:${name} may write test files only. In-place edit of ${outside.join(', ')} is not allowed.`);
      }
      const targets = [...redirectTargets(simple), ...(PATH_WRITING_VERBS.has(tokens[0] ?? '') ? tokens.slice(1).filter((t) => !t.startsWith('-')) : [])];
      const outside = targets.filter((target) => !isTestPath(target) && !isScratchPath(target));
      if (outside.length > 0) {
        return deny(`repertoire:${name} may write test files only. Not allowed: ${outside.join(', ')}. If the fix belongs in application code, report it as a finding instead.`);
      }
    }
  }

  return undefined;
}

function writeDecision(name: string, toolName: string, toolInput: Record<string, unknown>): Decision {
  if (!TEST_ONLY_WRITERS.has(name)) return undefined;

  const target = [toolInput.file_path, toolInput.notebook_path, toolInput.path].find((value): value is string => typeof value === 'string');
  if (target === undefined) return undefined;
  if (isTestPath(target) || isScratchPath(target)) return undefined;

  return deny(`repertoire:${name} may write test files only, and ${toolName} on ${target} is not a test file. If the fix belongs in application code, report it as a finding instead.`);
}

/** Decide one tool call. `undefined` means the policy has no objection. */
export function decide(call: ToolCall): Decision {
  const name = agentName(call.agentType);
  if (name === undefined) return undefined;

  if (call.toolName === 'Bash') {
    const command = call.toolInput.command;
    return typeof command === 'string' ? bashDecision(name, command) : undefined;
  }

  if (WRITE_TOOLS.has(call.toolName)) return writeDecision(name, call.toolName, call.toolInput);

  return undefined;
}
