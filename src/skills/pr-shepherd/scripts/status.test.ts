import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dir, 'status.ts');

let dir: string;
let fixtures: string;
let bin: string;

const FAKE_GH = `#!/bin/sh
echo "$@" >> "$FIXTURES/calls.log"
case "$1 $2" in
  "auth status") exit "\${AUTH_EXIT:-0}" ;;
  "pr view") [ -f "$FIXTURES/view.err" ] && { cat "$FIXTURES/view.err" >&2; exit 1; }; cat "$FIXTURES/view.json" ;;
  "pr checks") cat "$FIXTURES/checks.json"; exit "\${CHECKS_EXIT:-0}" ;;
  "api graphql")
    case "$*" in
      *after=CURSOR1*) cat "$FIXTURES/page2.json" ;;
      *) cat "$FIXTURES/page1.json" ;;
    esac ;;
  *) echo "unexpected: $*" >&2; exit 9 ;;
esac
`;

const view = (over: Record<string, unknown> = {}) => ({
  number: 7,
  url: 'https://github.com/acme/widgets/pull/7',
  state: 'OPEN',
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
  headRefOid: 'abc123',
  ...over,
});

const thread = (id: string, resolved: boolean, login = 'reviewer', body = 'fix this') => ({
  id,
  isResolved: resolved,
  path: 'src/a.ts',
  line: 12,
  comments: { nodes: [{ author: { login }, body }] },
});

const page = (nodes: unknown[], hasNextPage = false, endCursor: string | null = null) => ({
  data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage, endCursor }, nodes } } } },
});

const put = (name: string, value: unknown) =>
  writeFileSync(join(fixtures, name), typeof value === 'string' ? value : JSON.stringify(value));

const passing = [
  { name: 'build', state: 'SUCCESS', bucket: 'pass' },
  { name: 'lint', state: 'SKIPPED', bucket: 'skipping' },
];

async function run(args: string[] = [], env: Record<string, string> = {}, path?: string) {
  const proc = Bun.spawn([process.execPath, script, ...args], {
    env: { ...process.env, PATH: path ?? `${bin}:${process.env.PATH}`, FIXTURES: fixtures, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'status-test-'));
  fixtures = join(dir, 'fixtures');
  bin = join(dir, 'bin');
  mkdirSync(fixtures);
  mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), FAKE_GH);
  chmodSync(join(bin, 'gh'), 0o755);
  put('view.json', view());
  put('checks.json', passing);
  put('page1.json', page([thread('T1', true)]));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('status', () => {
  test('ready: exit 0 with the documented JSON shape', async () => {
    const result = await run(['7']);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      checks: [
        { name: 'build', state: 'SUCCESS' },
        { name: 'lint', state: 'SKIPPED' },
      ],
      mergeable: 'MERGEABLE',
      conflicts: false,
      unresolvedThreads: [],
      ready: true,
    });
    expect(readFileSync(join(fixtures, 'calls.log'), 'utf8')).toContain('pr view 7 --json');
  });

  test('omitting the PR lets gh pick the current branch', async () => {
    const result = await run();
    expect(result.code).toBe(0);
    expect(readFileSync(join(fixtures, 'calls.log'), 'utf8')).toContain('pr view --json');
  });

  test('failing check: exit 1 even when gh exits non-zero', async () => {
    put('checks.json', [...passing, { name: 'test', state: 'FAILURE', bucket: 'fail' }]);
    const result = await run(['7'], { CHECKS_EXIT: '1' });
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).ready).toBe(false);
  });

  test('pending check: exit 1', async () => {
    put('checks.json', [{ name: 'test', state: 'PENDING', bucket: 'pending' }]);
    const result = await run(['7'], { CHECKS_EXIT: '8' });
    expect(result.code).toBe(1);
  });

  test('conflicts: exit 1 with conflicts true', async () => {
    put('view.json', view({ mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }));
    const result = await run(['7']);
    const out = JSON.parse(result.stdout);
    expect(result.code).toBe(1);
    expect(out.conflicts).toBe(true);
    expect(out.mergeable).toBe('CONFLICTING');
  });

  test('mergeable UNKNOWN is not ready and says why on stderr', async () => {
    put('view.json', view({ mergeable: 'UNKNOWN' }));
    const result = await run(['7']);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).conflicts).toBe(false);
    expect(result.stderr).toContain('UNKNOWN');
  });

  test('unresolved thread: reported with last comment, resolved ones skipped', async () => {
    put('page1.json', page([thread('T1', true), thread('T2', false, 'rev', 'please rename')]));
    const result = await run(['7']);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).unresolvedThreads).toEqual([
      { id: 'T2', path: 'src/a.ts', line: 12, author: 'rev', body: 'please rename' },
    ]);
  });

  test('pages review threads on hasNextPage', async () => {
    put('page1.json', page([thread('T1', false)], true, 'CURSOR1'));
    put('page2.json', page([thread('T2', false)]));
    const result = await run(['7']);
    expect(JSON.parse(result.stdout).unresolvedThreads.map((t: { id: string }) => t.id)).toEqual([
      'T1',
      'T2',
    ]);
  });

  test('no checks reported counts as nothing failing', async () => {
    put('checks.json', '[]');
    expect((await run(['7'])).code).toBe(0);
  });

  test('gh not authenticated: exit 2', async () => {
    const result = await run(['7'], { AUTH_EXIT: '1' });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('gh auth login');
  });

  test('gh missing: exit 2', async () => {
    const empty = join(dir, 'empty');
    mkdirSync(empty);
    const result = await run(['7'], {}, empty);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('not installed');
  });

  test('gh pr view failure: exit 3', async () => {
    put('view.err', 'no pull requests found');
    const result = await run(['7']);
    expect(result.code).toBe(3);
    expect(result.stderr).toContain('no pull requests found');
  });

  test('closed PR: exit 3', async () => {
    put('view.json', view({ state: 'MERGED' }));
    const result = await run(['7']);
    expect(result.code).toBe(3);
    expect(result.stderr).toContain('MERGED');
  });

  test('bad arguments: exit 3', async () => {
    expect((await run(['--oops'])).code).toBe(3);
    expect((await run(['1', '2'])).code).toBe(3);
  });
});
