import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dir, 'codex-exec.ts');

let sandbox = '';
let fakeBin = '';
let log = '';

/**
 * A stand-in `codex` that records its arguments, stdin, and environment, then behaves according
 * to FAKE_CODEX_MODE. It uses absolute paths so it also works when PATH is restricted.
 */
const fakeCodex = `#!/bin/sh
printf '%s\\n' "$@" > "$FAKE_CODEX_LOG.args"
printf '%s' "\${ANTHROPIC_API_KEY-unset}" > "$FAKE_CODEX_LOG.env"
/bin/cat > "$FAKE_CODEX_LOG.stdin"
out=""
prev=""
for a in "$@"; do
  if [ "$prev" = "-o" ]; then out="$a"; fi
  prev="$a"
done
case "$FAKE_CODEX_MODE" in
  ok) printf 'VERDICT: the retry path is safe\\n' > "$out"; echo "progress line" ; exit 0 ;;
  json) printf '{"verdict":"no-findings"}' > "$out"; exit 0 ;;
  badjson) printf 'not json at all' > "$out"; exit 0 ;;
  empty) : > "$out"; echo "Reading additional input from stdin..." ; exit 0 ;;
  nofile) exit 0 ;;
  fail) echo "boom from codex" >&2; exit 1 ;;
  failwithfile) printf 'stale verdict' > "$out"; exit 1 ;;
  sandbox) echo "sandbox_apply: Operation not permitted" >&2; exit 1 ;;
  hang) /bin/sh -c '/bin/sleep 30'; exit 0 ;;
esac
exit 99
`;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'codex-exec-test-'));
  fakeBin = join(sandbox, 'bin');
  log = join(sandbox, 'log');
  spawnSync('mkdir', ['-p', fakeBin]);
  writeFileSync(join(fakeBin, 'codex'), fakeCodex);
  chmodSync(join(fakeBin, 'codex'), 0o755);
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function run(args: string[], options: { mode?: string; path?: string; env?: Record<string, string> } = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    timeout: 20_000,
    // If the script inherited stdin instead of ignoring it, the fake would record this text.
    input: 'leaked',
    env: {
      ...process.env,
      PATH: options.path ?? `${fakeBin}:${process.env.PATH ?? ''}`,
      FAKE_CODEX_MODE: options.mode ?? 'ok',
      FAKE_CODEX_LOG: log,
      ...options.env,
    },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr, signal: result.signal };
}

function recordedArguments(): string[] {
  return readFileSync(`${log}.args`, 'utf8').trimEnd().split('\n');
}

describe('codex-exec', () => {
  test('prints the final message on stdout and exits 0', () => {
    const result = run(['Is the retry path safe?']);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('VERDICT: the retry path is safe\n');
    expect(result.stderr).not.toContain('progress line');
  });

  test('pins the sandbox, disables persistence, writes a fresh output file, and closes stdin', () => {
    run(['first question']);
    const first = recordedArguments();
    expect(first.slice(0, 4)).toEqual(['exec', '--sandbox', 'read-only', '--ephemeral']);
    expect(first.at(-2)).toBe('--');
    expect(first.at(-1)).toBe('first question');
    expect(readFileSync(`${log}.stdin`, 'utf8')).toBe('');

    const firstOutput = first[first.indexOf('-o') + 1]!;
    expect(existsSync(firstOutput)).toBe(false);

    run(['second question']);
    const secondOutput = recordedArguments().at(recordedArguments().indexOf('-o') + 1)!;
    expect(secondOutput).not.toBe(firstOutput);
  });

  test('passes --model, --schema, --cd, and --ignore-user-config through', () => {
    const schema = join(sandbox, 'schema.json');
    writeFileSync(schema, '{"type":"object"}');
    const result = run(['-m', 'gpt-5.4', '--schema', schema, '--cd', sandbox, '--ignore-user-config', 'q'], {
      mode: 'json',
    });
    expect(result.code).toBe(0);
    const args = recordedArguments();
    expect(args).toContain('-m');
    expect(args[args.indexOf('-m') + 1]).toBe('gpt-5.4');
    expect(args[args.indexOf('--output-schema') + 1]).toBe(schema);
    expect(args[args.indexOf('-C') + 1]).toBe(sandbox);
    expect(args).toContain('--ignore-user-config');
    expect(result.stdout).toBe('{"verdict":"no-findings"}\n');
  });

  test('reads the prompt from --prompt-file', () => {
    const promptFile = join(sandbox, 'prompt.md');
    writeFileSync(promptFile, 'line one\nline two "quoted"\n');
    const result = run(['--prompt-file', promptFile]);
    expect(result.code).toBe(0);
    expect(recordedArguments().slice(-2)).toEqual(['line one', 'line two "quoted"']);
  });

  test('removes ANTHROPIC_API_KEY from the environment Codex sees', () => {
    run(['q'], { env: { ANTHROPIC_API_KEY: 'sk-ant-test' } });
    expect(readFileSync(`${log}.env`, 'utf8')).toBe('unset');
  });

  test('exits 1 with usage when no prompt is given', () => {
    const result = run([]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('no prompt');
    expect(existsSync(`${log}.args`)).toBe(false);
  });

  test('exits 1 on an unknown option or a bad timeout', () => {
    expect(run(['--bogus', 'q']).code).toBe(1);
    expect(run(['--timeout', 'soon', 'q']).code).toBe(1);
  });

  test('exits 2 when codex fails, even if it wrote a file', () => {
    const failed = run(['q'], { mode: 'fail' });
    expect(failed.code).toBe(2);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).toContain('boom from codex');

    const stale = run(['q'], { mode: 'failwithfile' });
    expect(stale.code).toBe(2);
    expect(stale.stdout).toBe('');
  });

  test('exits 3 when codex exits 0 with an empty or missing output file', () => {
    const empty = run(['q'], { mode: 'empty' });
    expect(empty.code).toBe(3);
    expect(empty.stdout).toBe('');
    expect(empty.stderr).toContain('no final message');

    const missing = run(['q'], { mode: 'nofile' });
    expect(missing.code).toBe(3);
  });

  test('exits 3 when a schema was given and the verdict is not JSON', () => {
    const schema = join(sandbox, 'schema.json');
    writeFileSync(schema, '{"type":"object"}');
    const result = run(['--schema', schema, 'q'], { mode: 'badjson' });
    expect(result.code).toBe(3);
    expect(result.stdout).toBe('');
  });

  test('exits 4 on timeout and kills the process group', () => {
    const started = Date.now();
    const result = run(['--timeout', '1', 'q'], { mode: 'hang' });
    expect(result.code).toBe(4);
    expect(result.stderr).toContain('exceeded 1s');
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 20_000);

  test('exits 5 when codex is not on PATH', () => {
    const result = run(['q'], { path: join(sandbox, 'empty') });
    expect(result.code).toBe(5);
    expect(result.stderr).toContain('not on PATH');
  });

  test('exits 6 when codex cannot start its sandbox inside another sandbox', () => {
    const result = run(['q'], { mode: 'sandbox' });
    expect(result.code).toBe(6);
    expect(result.stderr).toContain('sandbox.excludedCommands');
  });

  test('exits 1 when the schema file does not exist', () => {
    const result = run(['--schema', join(sandbox, 'nope.json'), 'q']);
    expect(result.code).toBe(1);
  });

  test('--help prints usage and exits 0 without running codex', () => {
    const result = run(['--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Exit codes');
    expect(existsSync(`${log}.args`)).toBe(false);
  });
});
