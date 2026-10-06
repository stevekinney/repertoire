import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dir, 'stage-git.ts');
let root: string;
let repo: string;

function git(cwd: string, ...args: string[]) {
  execFileSync('git', args, {
    cwd,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Ada',
      GIT_AUTHOR_EMAIL: 'ada@example.com',
      GIT_COMMITTER_NAME: 'Ada',
      GIT_COMMITTER_EMAIL: 'ada@example.com',
    },
  });
}

function stage(cwd: string, ...args: string[]) {
  const result = spawnSync('bun', ['run', script, ...args], { cwd, encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'stage-git-'));
  repo = join(root, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-q');
  writeFileSync(join(repo, 'app.txt'), 'one\ntwo\nthree\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'Add app for ERR-42 (a|b) (#7)');
  writeFileSync(join(repo, 'app.txt'), 'one\nTWO\nthree\n');
  git(repo, 'commit', '-q', '-am', 'Fix "quoted; $(rm -rf x)" bug');
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('stage-git', () => {
  test('writes commits, blame, and PR references and prints JSON', () => {
    const out = join(root, 'out1');
    const result = stage(repo, '--out', out, '--term', 'err-42', '--path', 'app.txt');
    expect(result.code).toBe(0);
    const listing = JSON.parse(result.stdout);
    expect(listing.files.map((f: { file: string }) => f.file.split('/').pop())).toEqual([
      'git-commits.md',
      'git-prs.md',
      'git-blame.md',
    ]);
    const commits = readFileSync(join(out, 'git-commits.md'), 'utf8');
    expect(commits).toContain('ERR-42');
    expect(commits).toContain('who: Ada');
    expect(readFileSync(join(out, 'git-prs.md'), 'utf8')).toContain('where: #7');
    const blame = readFileSync(join(out, 'git-blame.md'), 'utf8');
    expect(blame).toContain('top authors: Ada: 3 lines');
    expect(blame).toContain('lines 2-2');
  });

  test('matches terms literally and never runs them in a shell', () => {
    const out = join(root, 'out2');
    const result = stage(repo, '--out', out, '--term', '$(rm -rf x)');
    expect(result.code).toBe(0);
    expect(readFileSync(join(out, 'git-commits.md'), 'utf8')).toContain('quoted');
  });

  test('respects --limit', () => {
    const out = join(root, 'out3');
    expect(stage(repo, '--out', out, '--term', 'a', '--limit', '1').code).toBe(0);
    expect((readFileSync(join(out, 'git-commits.md'), 'utf8').match(/^--- source/gm) ?? []).length).toBe(1);
  });

  test('refuses a non-empty --out with exit 3 and leaves it alone', () => {
    const out = join(root, 'out4');
    mkdirSync(out);
    writeFileSync(join(out, 'keep.txt'), 'x');
    const result = stage(repo, '--out', out, '--term', 'ERR-42');
    expect(result.code).toBe(3);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('non-empty');
    expect(existsSync(join(out, 'git-commits.md'))).toBe(false);
  });

  test('accepts an existing empty --out', () => {
    const out = join(root, 'out5');
    mkdirSync(out);
    expect(stage(repo, '--out', out, '--term', 'ERR-42').code).toBe(0);
  });

  test('exits 2 on missing arguments or a bad limit', () => {
    expect(stage(repo, '--term', 'x').code).toBe(2);
    expect(stage(repo, '--out', join(root, 'o6')).code).toBe(2);
    expect(stage(repo, '--out', join(root, 'o7'), '--term', 'x', '--limit', '0').code).toBe(2);
  });

  test('exits 4 outside a repository', () => {
    const plain = join(root, 'plain');
    mkdirSync(plain);
    const result = stage(plain, '--out', join(root, 'o8'), '--term', 'x');
    expect(result.code).toBe(4);
  });

  test('exits 1 and writes nothing when git fails', () => {
    const out = join(root, 'out9');
    const result = stage(repo, '--out', out, '--term', 'x', '--path', 'missing.txt');
    expect(result.code).toBe(1);
    expect(existsSync(out)).toBe(false);
  });
});
