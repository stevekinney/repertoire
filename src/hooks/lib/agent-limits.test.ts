import { describe, expect, test } from 'bun:test';

import { agentName, decide, isTestPath, type ToolCall } from './agent-limits';

const call = (agent: string | undefined, toolName: string, toolInput: Record<string, unknown>): ToolCall => ({
  agentType: agent === undefined ? undefined : `repertoire:${agent}`,
  toolName,
  toolInput,
});
const bash = (agent: string | undefined, command: string) => decide(call(agent, 'Bash', { command }));
const write = (agent: string, path: string, tool = 'Write') => decide(call(agent, tool, { file_path: path }));

describe('scope', () => {
  test('ignores calls outside this plugin', () => {
    expect(decide({ agentType: undefined, toolName: 'Bash', toolInput: { command: 'git push' } })).toBeUndefined();
    expect(decide({ agentType: 'other:referee', toolName: 'Bash', toolInput: { command: 'git push' } })).toBeUndefined();
    expect(decide({ agentType: 'referee', toolName: 'Bash', toolInput: { command: 'git push' } })).toBeUndefined();
  });

  test('ignores tools it has no policy for', () => {
    expect(decide(call('reenactor', 'Read', { file_path: 'src/app.ts' }))).toBeUndefined();
    expect(decide(call('reenactor', 'Bash', { command: 42 }))).toBeUndefined();
  });

  test('agentName strips the plugin prefix', () => {
    expect(agentName('repertoire:referee')).toBe('referee');
    expect(agentName('referee')).toBeUndefined();
  });
});

describe('external effects, for every plugin agent', () => {
  test.each([
    'git push origin main',
    'git -C repo push',
    'gh pr merge 12 --squash',
    'gh issue comment 3 --body hi',
    'npm publish',
    'bun publish',
    'curl -X POST https://example.com -d x',
  ])('denies %s', (command) => {
    for (const agent of ['line-cook', 'saboteur', 'referee', 'reenactor']) expect(bash(agent, command)?.deny).toBe(true);
  });

  test('allows reads and ordinary commands', () => {
    expect(bash('line-cook', 'git status && bun test')).toBeUndefined();
    expect(bash('line-cook', 'gh pr view 12 --json state')).toBeUndefined();
    expect(bash('line-cook', 'curl https://example.com')).toBeUndefined();
  });
});

describe('observers are read-only toward the repository', () => {
  test.each(['git commit -m x', 'git add .', 'git checkout main', 'git reset --hard', 'git stash', 'git -C repo restore .', 'git clean -fd'])('denies %s', (command) => {
    expect(bash('referee', command)?.deny).toBe(true);
  });

  test('allows inspection', () => {
    for (const command of ['git log --oneline -5', 'git diff main...HEAD', 'git blame src/a.ts', 'git status --short', 'git worktree list', 'bun test', 'rg -n foo src']) {
      expect(bash('referee', command)).toBeUndefined();
    }
  });

  test('denies writes outside scratch space, allows scratch', () => {
    expect(bash('antagonist', 'echo hi > src/a.ts')?.deny).toBe(true);
    expect(bash('antagonist', 'sed -i s/a/b/ src/a.ts')?.deny).toBe(true);
    expect(bash('antagonist', 'rm -rf node_modules')?.deny).toBe(true);
    expect(bash('antagonist', 'cp a.txt b.txt')?.deny).toBe(true);
    expect(bash('antagonist', 'echo hi > /tmp/out.txt')).toBeUndefined();
    expect(bash('antagonist', 'bun test 2>&1 > /dev/null')).toBeUndefined();
    expect(bash('antagonist', 'mkdir -p /private/tmp/probe')).toBeUndefined();
  });

  test('the judge may check out a detached worktree but nothing else', () => {
    expect(bash('judge', 'git checkout --detach feature-a')).toBeUndefined();
    expect(bash('judge', 'git checkout feature-a')?.deny).toBe(true);
    expect(bash('judge', 'git commit -m x')?.deny).toBe(true);
  });

  test('every part of a compound command is checked', () => {
    expect(bash('referee', 'git status && git commit -m x')?.deny).toBe(true);
    expect(bash('referee', 'bun test; echo done > notes.md')?.deny).toBe(true);
  });
});

describe('test-only writers', () => {
  test('allow test files and scratch space through the write tools', () => {
    for (const path of ['src/a.test.ts', 'tests/auth.ts', 'pkg/__tests__/x.js', 'src/foo_test.go', 'tests/test_cart.py', '/tmp/repro.ts']) {
      expect(write('reenactor', path)).toBeUndefined();
    }
  });

  test('deny application code through every write tool', () => {
    for (const tool of ['Write', 'Edit', 'MultiEdit']) expect(write('reenactor', 'src/cart.ts', tool)?.deny).toBe(true);
    expect(write('test-designer', 'src/cart.ts')?.deny).toBe(true);
    expect(decide(call('reenactor', 'NotebookEdit', { notebook_path: 'analysis.ipynb' }))?.deny).toBe(true);
  });

  test('deny shell writes to application code, allow them to tests', () => {
    expect(bash('reenactor', 'echo x > src/cart.ts')?.deny).toBe(true);
    expect(bash('reenactor', 'sed -i s/a/b/ src/cart.ts')?.deny).toBe(true);
    expect(bash('reenactor', 'tee src/cart.ts')?.deny).toBe(true);
    expect(bash('reenactor', 'echo x > tests/cart.test.ts')).toBeUndefined();
    expect(bash('reenactor', 'bun test tests/cart.test.ts')).toBeUndefined();
  });

  test('deny git history changes', () => {
    expect(bash('reenactor', 'git commit -am fix')?.deny).toBe(true);
  });

  test('other agents write freely', () => {
    expect(write('line-cook', 'src/cart.ts')).toBeUndefined();
    expect(bash('line-cook', 'echo x > src/cart.ts')).toBeUndefined();
  });
});

describe('isTestPath', () => {
  test('recognizes common conventions', () => {
    for (const path of ['a.test.ts', 'a.spec.jsx', 'tests/a.rb', 'src/__tests__/a.ts', 'test_a.py', 'a_test.go', 'FooTest.java']) expect(isTestPath(path)).toBe(true);
    for (const path of ['src/a.ts', 'latest/a.ts', 'src/contest.ts']) expect(isTestPath(path)).toBe(false);
  });
});
