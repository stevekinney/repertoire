import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diffFeatureLists, validateFeatureList } from './lib/feature-list.ts';

const script = join(import.meta.dir, 'check-feature-list.ts');
const entry = (overrides: Record<string, unknown> = {}) => ({
  id: 'a',
  description: 'does a thing',
  steps: ['step'],
  passes: false,
  ...overrides,
});

describe('validateFeatureList', () => {
  test('accepts an array and a features object', () => {
    expect(validateFeatureList([entry()], false).valid).toBe(true);
    expect(validateFeatureList({ features: [entry()] }, false).valid).toBe(true);
  });
  test('rejects wrong top-level shape', () => {
    expect(validateFeatureList({ nope: [] }, false).valid).toBe(false);
  });
  test('rejects empty id, missing steps, and string passes', () => {
    expect(validateFeatureList([entry({ id: ' ' })], false).valid).toBe(false);
    expect(validateFeatureList([entry({ steps: 'x' })], false).valid).toBe(false);
    expect(validateFeatureList([entry({ passes: 'false' })], false).valid).toBe(false);
  });
  test('--initial requires every passes false', () => {
    expect(validateFeatureList([entry({ passes: true })], true).valid).toBe(false);
    expect(validateFeatureList([entry({ passes: true })], false).valid).toBe(true);
  });
});

describe('diffFeatureLists', () => {
  test('allows passes flips only', () => {
    expect(diffFeatureLists([entry()], [entry({ passes: true })]).valid).toBe(true);
  });
  test('rejects other changes, additions, and removals', () => {
    expect(diffFeatureLists([entry()], [entry({ description: 'x' })]).valid).toBe(false);
    expect(diffFeatureLists([entry()], [entry(), entry()]).valid).toBe(false);
    expect(diffFeatureLists([entry()], []).valid).toBe(false);
  });
});

describe('command line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfl-'));
  const file = (name: string, content: string) => {
    const path = join(dir, name);
    writeFileSync(path, content);
    return path;
  };
  const run = (args: string[]) => {
    try {
      const stdout = execFileSync('bun', [script, ...args], { encoding: 'utf8', stdio: 'pipe' });
      return { code: 0, stdout };
    } catch (error) {
      const e = error as { status: number; stdout: string };
      return { code: e.status, stdout: e.stdout };
    }
  };

  test('exit codes', () => {
    const good = file('good.json', JSON.stringify([entry()]));
    const passed = file('passed.json', JSON.stringify([entry({ passes: true })]));
    const changed = file('changed.json', JSON.stringify([entry({ id: 'z' })]));
    const bad = file('bad.json', '{not json');
    expect(run([good, '--initial']).code).toBe(0);
    expect(JSON.parse(run([good]).stdout).valid).toBe(true);
    expect(run([passed, '--initial']).code).toBe(1);
    expect(run([bad]).code).toBe(1);
    expect(run([join(dir, 'missing.json')]).code).toBe(2);
    expect(run(['diff', good, passed]).code).toBe(0);
    expect(run(['diff', good, changed]).code).toBe(1);
    expect(run(['diff', good]).code).toBe(2);
  });
});
