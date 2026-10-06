import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { parseArgs, scanDiff } from './scan-diff';

const diff = (file: string, body: string, extra = '') =>
  `diff --git a/${file} b/${file}\n${extra}--- a/${file}\n+++ b/${file}\n${body}`;

const kinds = (d: string) => scanDiff(d).map((f) => f.kind);

describe('scanDiff', () => {
  test('clean diff has no findings', () => {
    const d = diff('src/a.ts', '@@ -1,1 +1,2 @@\n const a = 1;\n+const b = 2;\n');
    expect(scanDiff(d)).toEqual([]);
  });

  test('flags removed assertions with file and old line', () => {
    const d = diff(
      'src/a.test.ts',
      '@@ -10,3 +10,2 @@\n test("x", () => {\n-  expect(add(1, 2)).toBe(3);\n });\n',
    );
    expect(scanDiff(d)).toEqual([
      { kind: 'assertion-removed', file: 'src/a.test.ts', line: 11, text: 'expect(add(1, 2)).toBe(3);' },
    ]);
  });

  test('flags skip and only added in tests, not removed ones', () => {
    const d = diff(
      'src/a.test.ts',
      '@@ -1,2 +1,2 @@\n-it.skip("a", f);\n+it.only("b", f);\n+xit("c", f);\n',
    );
    expect(kinds(d)).toEqual(['test-skipped', 'test-skipped']);
  });

  test('flags edited expected values only when source changed too', () => {
    const testEdit = diff(
      'src/a.test.ts',
      '@@ -5,1 +5,1 @@\n-  expect(add(1, 2)).toBe(3);\n+  expect(add(1, 2)).toBe(4);\n',
    );
    expect(kinds(testEdit)).toEqual([]);
    const src = diff('src/a.ts', '@@ -1,1 +1,1 @@\n-a\n+b\n');
    const result = scanDiff(src + testEdit);
    expect(result).toEqual([
      { kind: 'expected-value-edited', file: 'src/a.test.ts', line: 5, text: 'expect(add(1, 2)).toBe(4);' },
    ]);
  });

  test('flags disabled lint and type rules', () => {
    const d = diff(
      'src/a.ts',
      '@@ -1,1 +1,4 @@\n x\n+// eslint-disable-next-line no-console\n+// @ts-ignore\n+import os  # noqa\n',
    );
    expect(kinds(d)).toEqual([
      'lint-or-type-rule-disabled',
      'lint-or-type-rule-disabled',
      'lint-or-type-rule-disabled',
    ]);
  });

  test('flags lowered thresholds but not raised ones', () => {
    const lowered = diff('jest.config.json', '@@ -3,1 +3,1 @@\n-  "branches": 80,\n+  "branches": 60,\n');
    expect(scanDiff(lowered)).toEqual([
      { kind: 'threshold-lowered', file: 'jest.config.json', line: 3, text: '"branches": 60,' },
    ]);
    const raised = diff('jest.config.json', '@@ -3,1 +3,1 @@\n-  "branches": 60,\n+  "branches": 80,\n');
    expect(scanDiff(raised)).toEqual([]);
    const toml = diff('pyproject.toml', '@@ -1,1 +1,1 @@\n-fail_under = 90\n+fail_under = 70\n');
    expect(kinds(toml)).toEqual(['threshold-lowered']);
  });

  test('flags snapshot updates once per file', () => {
    const d = diff(
      'src/__snapshots__/a.test.ts.snap',
      '@@ -1,1 +1,1 @@\n-old\n+new\n@@ -9,1 +9,1 @@\n-old2\n+new2\n',
    );
    expect(scanDiff(d)).toEqual([
      { kind: 'snapshot-updated', file: 'src/__snapshots__/a.test.ts.snap', line: 1, text: 'new' },
    ]);
  });

  test('flags a deleted test file once without per-assertion noise', () => {
    const d =
      'diff --git a/src/a.test.ts b/src/a.test.ts\ndeleted file mode 100644\n--- a/src/a.test.ts\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-expect(1).toBe(1);\n-expect(2).toBe(2);\n';
    expect(kinds(d)).toEqual(['test-file-deleted']);
  });

  test('does not mistake a removed "-- " line for a file header', () => {
    const d = diff('src/a.test.ts', '@@ -1,2 +1,1 @@\n--- a/x\n expect(1).toBe(1);\n');
    expect(scanDiff(d)).toEqual([]);
  });
});

describe('parseArgs', () => {
  test('accepts --base and --stdin, rejects bad input', () => {
    expect(parseArgs(['--base', 'main']).base).toBe('main');
    expect(parseArgs(['--stdin']).stdin).toBe(true);
    expect(() => parseArgs(['--base'])).toThrow();
    expect(() => parseArgs(['--base', '--output=x'])).toThrow();
    expect(() => parseArgs(['--stdin', '--base', 'main'])).toThrow();
    expect(() => parseArgs(['--nope'])).toThrow();
  });
});

describe('cli', () => {
  const run = (input: string, args: string[] = ['--stdin']) =>
    spawnSync(process.execPath, [new URL('./scan-diff.ts', import.meta.url).pathname, ...args], {
      input,
      encoding: 'utf8',
    });

  test('exits 1 with JSON when findings exist', () => {
    const r = run(diff('src/a.ts', '@@ -1,1 +1,2 @@\n x\n+// @ts-ignore\n'));
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).findings[0].kind).toBe('lint-or-type-rule-disabled');
  });

  test('exits 0 with empty findings on a clean or empty diff', () => {
    const r = run('');
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ findings: [] });
  });

  test('exits 2 on a usage error', () => {
    const r = run('', ['--bogus']);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('unknown argument');
  });
});
