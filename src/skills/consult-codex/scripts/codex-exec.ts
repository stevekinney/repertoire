/**
 * Runs one read-only, ephemeral `codex exec` consult and prints only Codex's final message.
 *
 * Usage:
 *   node codex-exec.mjs [options] "<prompt>"
 *   node codex-exec.mjs [options] --prompt-file <path>
 *
 * Options:
 *   -m, --model <id>        Pin the model (passed through as `codex exec -m`).
 *   --schema <file>         Passed through as `--output-schema`; the final message must then parse as JSON.
 *   --timeout <seconds>     Kill Codex after this long. Default 540, which is under the 600 s cap of
 *                           Claude Code's Bash tool, so this script's exit code is what the caller sees.
 *   --cd <dir>              Passed through as `-C`; Codex's working root. Default: the current directory.
 *   --ignore-user-config    Passed through; skips `~/.codex/config.toml` and the MCP servers it enables.
 *   -h, --help              Print this help and exit 0.
 *
 * Always passed: `--sandbox read-only`, `--ephemeral`, `-o <fresh temp file>`. Stdin is closed, because
 * `codex exec` appends an open stdin to the prompt and can wait on it forever. `ANTHROPIC_API_KEY` is
 * removed from Codex's environment so nothing it runs can land on a second bill.
 *
 * Output: the final message on stdout, nothing else. Diagnostics on stderr. Codex's own stream is kept
 * in memory and only its tail is printed, on failure.
 *
 * Exit codes:
 *   0  verdict on stdout
 *   1  usage error (no prompt, bad option, unreadable prompt or schema file)
 *   2  codex exited non-zero or was killed by a signal
 *   3  no verdict: codex exited 0 but wrote nothing, or wrote non-JSON when a schema was given
 *   4  timeout
 *   5  codex not found on PATH
 *   6  codex could not start its own sandbox (nested inside Claude Code's sandbox)
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EXIT = {
  verdict: 0,
  usage: 1,
  codexFailed: 2,
  noVerdict: 3,
  timeout: 4,
  codexMissing: 5,
  sandboxBlocked: 6,
} as const;

const DEFAULT_TIMEOUT_SECONDS = 540;
const KILL_GRACE_MS = 5_000;
const STREAM_TAIL_LINES = 40;
const STREAM_CAP_BYTES = 1_000_000;

interface Options {
  prompt: string;
  model?: string;
  schema?: string;
  timeoutSeconds: number;
  cd?: string;
  ignoreUserConfig: boolean;
}

class UsageError extends Error {}

function help(): string {
  return [
    'Usage: codex-exec.mjs [options] "<prompt>"',
    '       codex-exec.mjs [options] --prompt-file <path>',
    '',
    'Options:',
    '  -m, --model <id>       Pin the model.',
    '  --schema <file>        JSON Schema for the final message (codex --output-schema).',
    `  --timeout <seconds>    Kill Codex after this long (default ${DEFAULT_TIMEOUT_SECONDS}).`,
    "  --cd <dir>             Codex's working root (default: current directory).",
    '  --ignore-user-config   Skip ~/.codex/config.toml and its MCP servers.',
    '',
    'Exit codes: 0 verdict, 1 usage, 2 codex failed, 3 no verdict, 4 timeout, 5 codex missing,',
    "6 codex blocked by Claude Code's sandbox.",
  ].join('\n');
}

function parseArguments(argv: string[]): Options | 'help' {
  let prompt: string | undefined;
  let promptFile: string | undefined;
  let model: string | undefined;
  let schema: string | undefined;
  let cd: string | undefined;
  let timeoutSeconds = DEFAULT_TIMEOUT_SECONDS;
  let ignoreUserConfig = false;

  const takeValue = (flag: string, index: number): string => {
    const value = argv[index + 1];
    if (value === undefined) throw new UsageError(`${flag} needs a value`);
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    switch (argument) {
      case '-h':
      case '--help':
        return 'help';
      case '-m':
      case '--model':
        model = takeValue(argument, index);
        index += 1;
        break;
      case '--schema':
        schema = takeValue(argument, index);
        index += 1;
        break;
      case '--cd':
        cd = takeValue(argument, index);
        index += 1;
        break;
      case '--prompt-file':
        promptFile = takeValue(argument, index);
        index += 1;
        break;
      case '--timeout': {
        const raw = takeValue(argument, index);
        timeoutSeconds = Number(raw);
        if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
          throw new UsageError(`--timeout must be a positive number of seconds, got "${raw}"`);
        }
        index += 1;
        break;
      }
      case '--ignore-user-config':
        ignoreUserConfig = true;
        break;
      case '--':
        prompt = argv.slice(index + 1).join(' ');
        index = argv.length;
        break;
      default:
        if (argument.startsWith('-') && argument !== '-') throw new UsageError(`unknown option ${argument}`);
        if (prompt !== undefined) throw new UsageError('only one positional prompt is allowed; quote it');
        prompt = argument;
    }
  }

  if (prompt !== undefined && promptFile !== undefined) {
    throw new UsageError('pass either a positional prompt or --prompt-file, not both');
  }
  if (promptFile !== undefined) {
    try {
      prompt = readFileSync(promptFile, 'utf8');
    } catch (error) {
      throw new UsageError(`cannot read --prompt-file ${promptFile}: ${(error as Error).message}`);
    }
  }
  if (prompt === undefined || prompt.trim() === '' || prompt === '-') {
    throw new UsageError('no prompt given; pass the question as one quoted argument or with --prompt-file');
  }
  if (schema !== undefined && !existsSync(schema)) {
    throw new UsageError(`--schema file does not exist: ${schema}`);
  }

  return { prompt, model, schema, timeoutSeconds, cd, ignoreUserConfig };
}

function buildCodexArguments(options: Options, outputFile: string): string[] {
  const codexArguments = ['exec', '--sandbox', 'read-only', '--ephemeral', '-o', outputFile];
  if (options.model !== undefined) codexArguments.push('-m', options.model);
  if (options.schema !== undefined) codexArguments.push('--output-schema', options.schema);
  if (options.cd !== undefined) codexArguments.push('-C', options.cd);
  if (options.ignoreUserConfig) codexArguments.push('--ignore-user-config');
  codexArguments.push('--', options.prompt);
  return codexArguments;
}

/** Keeps at most `STREAM_CAP_BYTES` of the most recent output. */
class Tail {
  private chunks: string[] = [];
  private size = 0;

  push(chunk: Buffer): void {
    const text = chunk.toString('utf8');
    this.chunks.push(text);
    this.size += text.length;
    while (this.size > STREAM_CAP_BYTES && this.chunks.length > 1) {
      this.size -= this.chunks.shift()!.length;
    }
  }

  text(): string {
    return this.chunks.join('');
  }

  lastLines(count: number): string {
    return this.text().trimEnd().split('\n').slice(-count).join('\n');
  }
}

interface Outcome {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  spawnError?: NodeJS.ErrnoException;
}

function runCodex(codexArguments: string[], timeoutSeconds: number, stream: Tail): Promise<Outcome> {
  return new Promise((resolve) => {
    const environment = { ...process.env };
    delete environment.ANTHROPIC_API_KEY;

    // `detached` puts Codex in its own process group, so a timeout can kill the shell commands it
    // spawned too. Otherwise a grandchild holding the pipes keeps `close` from firing.
    const child = spawn('codex', codexArguments, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: environment,
      detached: process.platform !== 'win32',
    });

    let timedOut = false;
    let spawnError: NodeJS.ErrnoException | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    const killGroup = (signal: NodeJS.Signals) => {
      if (child.pid === undefined) return;
      try {
        if (process.platform === 'win32') child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch {
        // Already gone.
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup('SIGTERM');
      killTimer = setTimeout(() => killGroup('SIGKILL'), KILL_GRACE_MS);
    }, timeoutSeconds * 1000);

    const forward = () => {
      killGroup('SIGTERM');
    };
    process.once('SIGINT', forward);
    process.once('SIGTERM', forward);

    child.stdout.on('data', (chunk: Buffer) => stream.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stream.push(chunk));
    child.on('error', (error: NodeJS.ErrnoException) => {
      spawnError = error;
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      process.off('SIGINT', forward);
      process.off('SIGTERM', forward);
      resolve({ code, signal, timedOut, spawnError });
    });
  });
}

function readVerdict(outputFile: string): string | undefined {
  if (!existsSync(outputFile)) return undefined;
  const text = readFileSync(outputFile, 'utf8');
  return text.trim() === '' ? undefined : text;
}

function diagnostic(message: string): void {
  process.stderr.write(`codex-exec: ${message}\n`);
}

function finish(code: number, verdict?: string): void {
  if (verdict === undefined) {
    process.exitCode = code;
    return;
  }
  // Exit from the write callback, so a large verdict is not truncated when stdout is a pipe.
  process.stdout.write(verdict.endsWith('\n') ? verdict : `${verdict}\n`, () => {
    process.exitCode = code;
  });
}

async function main(): Promise<void> {
  let options: Options | 'help';
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      diagnostic(error.message);
      process.stderr.write(`${help()}\n`);
      finish(EXIT.usage);
      return;
    }
    throw error;
  }
  if (options === 'help') {
    process.stdout.write(`${help()}\n`);
    return;
  }

  const bill = process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY (per-token API billing)' : "Codex's own login";
  diagnostic(`model=${options.model ?? 'unpinned'} timeout=${options.timeoutSeconds}s bill=${bill}`);
  if (options.model === undefined) {
    diagnostic('no --model given, so the result depends on the Codex default and will drift across upgrades');
  }

  const scratch = mkdtempSync(join(tmpdir(), 'codex-exec-'));
  const outputFile = join(scratch, 'last-message.txt');
  const stream = new Tail();

  try {
    const outcome = await runCodex(buildCodexArguments(options, outputFile), options.timeoutSeconds, stream);
    const tail = stream.lastLines(STREAM_TAIL_LINES);

    if (outcome.spawnError?.code === 'ENOENT') {
      diagnostic('codex is not on PATH; install the Codex CLI (npm i -g @openai/codex) and sign in, then rerun');
      finish(EXIT.codexMissing);
      return;
    }
    if (outcome.spawnError) {
      diagnostic(`could not start codex: ${outcome.spawnError.message}`);
      finish(EXIT.codexFailed);
      return;
    }
    if (outcome.timedOut) {
      diagnostic(
        `codex exceeded ${options.timeoutSeconds}s and was killed; narrow the question, raise --timeout, or run in the background`,
      );
      if (tail) process.stderr.write(`${tail}\n`);
      finish(EXIT.timeout);
      return;
    }
    if (outcome.code !== 0) {
      if (/sandbox_apply|Operation not permitted/.test(stream.text())) {
        diagnostic(
          "codex could not start its own sandbox, which happens when it runs inside Claude Code's sandbox; add this command to sandbox.excludedCommands in Claude Code settings so Codex sandboxes itself (read-only)",
        );
        if (tail) process.stderr.write(`${tail}\n`);
        finish(EXIT.sandboxBlocked);
        return;
      }
      const reason = outcome.signal ? `was killed by ${outcome.signal}` : `exited ${outcome.code}`;
      diagnostic(`codex ${reason}; no verdict is trusted from a failed run`);
      if (tail) process.stderr.write(`${tail}\n`);
      finish(EXIT.codexFailed);
      return;
    }

    const verdict = readVerdict(outputFile);
    if (verdict === undefined) {
      diagnostic('codex exited 0 but wrote no final message; a reviewer that produced nothing has not approved anything');
      if (tail) process.stderr.write(`${tail}\n`);
      finish(EXIT.noVerdict);
      return;
    }
    if (options.schema !== undefined) {
      try {
        JSON.parse(verdict);
      } catch {
        diagnostic('the final message is not valid JSON although --schema was given; treat the run as producing no verdict');
        process.stderr.write(`${verdict.slice(0, 2_000)}\n`);
        finish(EXIT.noVerdict);
        return;
      }
    }
    finish(EXIT.verdict, verdict);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

await main();
