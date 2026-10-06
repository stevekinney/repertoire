import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSection, merge, parseArgs, writeHandoff } from './write-handoff.ts';

const script = join(import.meta.dir, 'write-handoff.ts');
const stamp = '2026-10-06T12:00:00Z';
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'handoff-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const opts = (file: string, section = 'handoff') => ({ file, section, verifiedAt: stamp });

describe('writeHandoff', () => {
  test('creates, then replaces without duplicating', () => {
    const file = join(dir, 'HANDOFF.md');
    expect(writeHandoff(opts(file), 'one').action).toBe('created');
    expect(writeHandoff(opts(file), 'two').action).toBe('replaced');
    const text = readFileSync(file, 'utf8');
    expect(text.match(/handoff:start/g)).toHaveLength(1);
    expect(text).toContain('two');
    expect(text).not.toContain('one');
    expect(text).toContain(stamp);
  });

  test('appends below existing content and keeps it', () => {
    const file = join(dir, 'PROGRESS.md');
    writeFileSync(file, '# Plan\n\nkeep me\n');
    expect(writeHandoff(opts(file), 'note').action).toBe('appended');
    const text = readFileSync(file, 'utf8');
    expect(text.startsWith('# Plan\n\nkeep me\n\n<!-- handoff:start -->')).toBe(true);
  });

  test('replace preserves text before and after', () => {
    const file = join(dir, 'a.md');
    writeFileSync(file, 'before\n<!-- handoff:start -->\nold\n<!-- handoff:end -->\nafter\n');
    writeHandoff(opts(file), 'new');
    const text = readFileSync(file, 'utf8');
    expect(text.startsWith('before\n')).toBe(true);
    expect(text.endsWith('\nafter\n')).toBe(true);
    expect(text).not.toContain('old');
  });

  test('custom section markers are used and a body carrying them is unwrapped', () => {
    const file = join(dir, 'a.md');
    writeHandoff(opts(file, 'session-handoff'), '<!-- session-handoff:start -->\nbody\n<!-- session-handoff:end -->\n');
    const text = readFileSync(file, 'utf8');
    expect(text.match(/session-handoff:start/g)).toHaveLength(1);
    expect(text.match(/session-handoff:end/g)).toHaveLength(1);
  });

  test('refuses empty input without touching the file', () => {
    const file = join(dir, 'a.md');
    writeFileSync(file, 'x');
    expect(() => writeHandoff(opts(file), '  \n')).toThrow(/empty/);
    expect(readFileSync(file, 'utf8')).toBe('x');
  });

  test('refuses symlinks', () => {
    const real = join(dir, 'real.md');
    writeFileSync(real, 'x');
    const link = join(dir, 'link.md');
    symlinkSync(real, link);
    expect(() => writeHandoff(opts(link), 'note')).toThrow(/symlink/);
    expect(readFileSync(real, 'utf8')).toBe('x');
  });

  test('refuses malformed markers and leaves the file alone', () => {
    const file = join(dir, 'a.md');
    writeFileSync(file, '<!-- handoff:start -->\nno end\n');
    expect(() => writeHandoff(opts(file), 'note')).toThrow(/malformed/);
    expect(readFileSync(file, 'utf8')).toBe('<!-- handoff:start -->\nno end\n');
  });

  test('leaves no temp files behind', () => {
    writeHandoff(opts(join(dir, 'a.md')), 'note');
    expect(readdirSync(dir)).toEqual(['a.md']);
  });
});

describe('helpers', () => {
  test('parseArgs requires --file and a valid --verified-at', () => {
    expect(() => parseArgs([])).toThrow(/--file/);
    expect(() => parseArgs(['--file', 'a'])).toThrow(/--verified-at/);
    expect(() => parseArgs(['--file', 'a', '--verified-at', 'yesterday'])).toThrow(/ISO/);
    expect(parseArgs(['--file', 'a', '--verified-at', stamp]).section).toBe('handoff');
  });

  test('merge and buildSection are pure', () => {
    const block = buildSection('x', 'handoff', stamp);
    expect(merge(undefined, block, 'handoff').action).toBe('created');
  });
});

describe('cli', () => {
  const run = (args: string[], input: string) =>
    Bun.spawnSync(['bun', script, ...args], { stdin: new TextEncoder().encode(input) });

  test('prints JSON on stdout and exits 0', () => {
    const file = join(dir, 'a.md');
    const result = run(['--file', file, '--verified-at', stamp], 'hello');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.toString())).toEqual({ path: file, action: 'created' });
  });

  test('exit codes: 2 usage, 3 empty input, 4 symlink', () => {
    const file = join(dir, 'a.md');
    expect(run(['--file', file], 'x').exitCode).toBe(2);
    expect(run(['--file', file, '--verified-at', stamp], '').exitCode).toBe(3);
    const link = join(dir, 'l.md');
    symlinkSync(file, link);
    const result = run(['--file', link, '--verified-at', stamp], 'x');
    expect(result.exitCode).toBe(4);
    expect(result.stderr.toString()).toContain('symlink');
  });
});
