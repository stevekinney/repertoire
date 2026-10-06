/**
 * PreToolUse hook: enforces the limits repertoire subagents can't express in their `tools` allowlist.
 * See lib/agent-limits.ts for the policy. Reads the hook payload on stdin and prints a deny decision
 * when a call from one of this plugin's subagents breaks a limit; otherwise prints nothing and exits 0.
 *
 * Fails open: a payload this hook can't read is allowed through with a note on stderr, so a bug here
 * can never lock a session out of its tools.
 */

import { readFileSync } from 'node:fs';

import { decide } from './lib/agent-limits';

function main(): void {
  let payload: unknown;
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'));
  } catch (error) {
    process.stderr.write(`enforce-agent-limits: unreadable payload, allowing the call (${String(error)})\n`);
    return;
  }

  if (typeof payload !== 'object' || payload === null) return;
  const input = payload as Record<string, unknown>;
  if (input.hook_event_name !== 'PreToolUse' || typeof input.tool_name !== 'string') return;

  const toolInput = typeof input.tool_input === 'object' && input.tool_input !== null ? (input.tool_input as Record<string, unknown>) : {};
  const decision = decide({
    agentType: typeof input.agent_type === 'string' ? input.agent_type : undefined,
    toolName: input.tool_name,
    toolInput,
  });

  if (!decision) return;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: decision.reason,
      },
    }) + '\n',
  );
}

main();
