import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPlan, parsePlanArguments } from './integrate.ts';

let repo: string;

function git(...args: string[]): string {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function commit(file: string, content: string, message: string): void {
  writeFileSync(join(repo, file), content);
  git('add', file);
  git('commit', '-q', '-m', message);
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'integrate-test-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  commit('shared.txt', 'one\ntwo\nthree\n', 'base');
  git('branch', 'merged');
  for (const name of ['alpha', 'beta', 'gamma']) git('branch', name);
  git('switch', '-q', 'alpha');
  commit('shared.txt', 'ONE\ntwo\nthree\n', 'alpha edits shared');
  commit('a.txt', 'a\n', 'alpha adds a');
  git('switch', '-q', 'beta');
  commit('shared.txt', 'uno\ntwo\nthree\n', 'beta edits shared');
  git('switch', '-q', 'gamma');
  commit('g.txt', 'g\n', 'gamma adds g');
  git('switch', '-q', 'main');
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe('plan', () => {
  test('reports commits, files, merged state, overlaps, and conflicts', () => {
    const before = git('rev-parse', 'HEAD') + git('status', '--porcelain') + git('branch', '--show-current');
    const plan = buildPlan(repo, 'main', ['alpha', 'beta', 'gamma', 'merged']);
    const byName = Object.fromEntries(plan.branches.map((b) => [b.branch, b]));

    expect(byName.alpha!.commits.map((c) => c.subject)).toEqual(['alpha adds a', 'alpha edits shared']);
    expect(byName.alpha!.files).toEqual(['a.txt', 'shared.txt']);
    expect(byName.alpha!.alreadyMerged).toBe(false);
    expect(byName.merged!.alreadyMerged).toBe(true);
    expect(byName.merged!.commits).toEqual([]);
    expect(plan.overlaps).toEqual([{ a: 'alpha', b: 'beta', files: ['shared.txt'] }]);

    if (plan.mergeTreeSupported) {
      expect(byName.gamma!.prediction).toBe('clean');
      expect(byName.alpha!.prediction).toBe('clean');
    } else {
      expect(byName.gamma!.prediction).toBe('unknown');
    }

    expect(git('rev-parse', 'HEAD') + git('status', '--porcelain') + git('branch', '--show-current')).toBe(before);
  });

  test('predicts a conflict against base when base moved', () => {
    git('switch', '-q', '-c', 'moved', 'main');
    commit('shared.txt', 'base-side\ntwo\nthree\n', 'main-side change');
    const plan = buildPlan(repo, 'moved', ['alpha']);
    git('switch', '-q', 'main');
    if (plan.mergeTreeSupported) {
      expect(plan.branches[0]!.prediction).toBe('conflict');
      expect(plan.branches[0]!.conflictingFiles).toEqual(['shared.txt']);
    }
  });

  test('rejects an unknown branch with an actionable error', () => {
    expect(() => buildPlan(repo, 'main', ['nope'])).toThrow('nope');
  });
});

describe('argument parsing', () => {
  test('parses base and branches', () => {
    expect(parsePlanArguments(['--base', 'main', 'a', 'b']).branches).toEqual(['a', 'b']);
  });

  test('requires a base and a branch', () => {
    expect(() => parsePlanArguments(['a'])).toThrow('--base');
    expect(() => parsePlanArguments(['--base', 'main'])).toThrow('branch');
  });

  test('rejects option-looking values', () => {
    expect(() => parsePlanArguments(['--base', '--evil', 'a'])).toThrow();
    expect(() => parsePlanArguments(['--base', 'main', '--oops'])).toThrow('Unknown option');
  });
});
