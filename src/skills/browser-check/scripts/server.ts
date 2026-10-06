import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { join } from 'node:path';

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_USAGE = 2;
const EXIT_TIMEOUT = 3;

const DIRECTORY = '.browser-check';
const PID_FILE = join(DIRECTORY, 'server.pid');
const LOG_FILE = join(DIRECTORY, 'server.log');
const DEFAULT_TIMEOUT_SECONDS = 60;
const POLL_INTERVAL_MS = 500;

class UsageError extends Error {}

const usage = `Usage:
  server.mjs start --cmd <command> --url <url> [--timeout <seconds>]
  server.mjs stop

Exit codes: 0 ok, 1 failed, 2 usage error, 3 readiness timeout.`;

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Split a command string into an argument array. Honors quotes; never invokes a shell. */
export function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: string | null = null;
  let started = false;
  for (const character of command) {
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
    } else if (character === '"' || character === "'") {
      quote = character;
      started = true;
    } else if (/\s/.test(character)) {
      if (started) tokens.push(current);
      current = '';
      started = false;
    } else {
      current += character;
      started = true;
    }
  }
  if (quote) throw new UsageError('--cmd has an unterminated quote.');
  if (started) tokens.push(current);
  return tokens;
}

/** Resolves true when anything answers the URL with any HTTP status. */
function probe(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const client = url.startsWith('https:') ? https : http;
    const request = client.get(url, { timeout: 2000 }, (response) => {
      response.resume();
      resolve(true);
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

function isAlive(groupId: number): boolean {
  try {
    process.kill(-groupId, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readRecordedGroup(): number | null {
  if (!existsSync(PID_FILE)) return null;
  const value = Number(readFileSync(PID_FILE, 'utf8').trim());
  return Number.isInteger(value) && value > 1 ? value : null;
}

/** Stop the recorded process group and delete the pid file. Returns the group id stopped, if any. */
async function stopRecorded(): Promise<number | null> {
  const groupId = readRecordedGroup();
  if (groupId !== null && isAlive(groupId)) {
    try {
      process.kill(-groupId, 'SIGTERM');
    } catch {
      // Already gone.
    }
    for (let attempt = 0; attempt < 20 && isAlive(groupId); attempt++) await sleep(250);
    if (isAlive(groupId)) {
      try {
        process.kill(-groupId, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }
  }
  rmSync(PID_FILE, { force: true });
  return groupId;
}

function parseFlags(args: string[], allowed: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    if (!name?.startsWith('--') || !allowed.includes(name.slice(2))) {
      throw new UsageError(`Unknown argument: ${name}`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new UsageError(`${name} needs a value.`);
    }
    flags.set(name.slice(2), value);
  }
  return flags;
}

async function start(args: string[]): Promise<number> {
  const flags = parseFlags(args, ['cmd', 'url', 'timeout']);
  const command = flags.get('cmd');
  const url = flags.get('url');
  if (!command || !url) throw new UsageError('start needs --cmd and --url.');
  if (!/^https?:\/\//.test(url)) throw new UsageError('--url must start with http:// or https://.');
  const timeoutSeconds = Number(flags.get('timeout') ?? DEFAULT_TIMEOUT_SECONDS);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new UsageError('--timeout must be a positive number of seconds.');
  }
  const [program, ...programArguments] = tokenize(command);
  if (!program) throw new UsageError('--cmd is empty.');

  const previous = await stopRecorded();
  if (previous !== null) console.error(`Stopped previous process group ${previous}.`);

  if (await probe(url)) {
    console.log(JSON.stringify({ result: 'found', url }));
    return EXIT_OK;
  }

  mkdirSync(DIRECTORY, { recursive: true });
  const logDescriptor = openSync(LOG_FILE, 'a');
  let spawnError: Error | null = null;
  let exitedWith: number | string | null = null;
  const child = spawn(program, programArguments, {
    detached: true,
    stdio: ['ignore', logDescriptor, logDescriptor],
  });
  closeSync(logDescriptor);
  child.on('error', (error) => {
    spawnError = error;
  });
  child.on('exit', (code, signal) => {
    exitedWith = code ?? signal;
  });
  child.unref();
  if (child.pid === undefined) {
    await sleep(0);
    console.error(`Could not start "${program}": ${spawnError ?? 'unknown error'}`);
    return EXIT_FAILED;
  }
  writeFileSync(PID_FILE, `${child.pid}\n`);

  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    if (spawnError || exitedWith !== null) {
      rmSync(PID_FILE, { force: true });
      console.error(
        `The server command exited before ${url} answered (${spawnError ?? exitedWith}). See ${LOG_FILE}.`,
      );
      return EXIT_FAILED;
    }
    if (await probe(url)) {
      console.log(JSON.stringify({ result: 'started', url }));
      return EXIT_OK;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  console.error(`${url} did not answer within ${timeoutSeconds}s. The server is still running; see ${LOG_FILE}, then run stop.`);
  console.log(JSON.stringify({ result: 'timeout', url }));
  return EXIT_TIMEOUT;
}

async function stop(args: string[]): Promise<number> {
  parseFlags(args, []);
  const groupId = await stopRecorded();
  console.log(JSON.stringify({ result: groupId === null ? 'none' : 'stopped' }));
  return EXIT_OK;
}

async function main(argv: string[]): Promise<number> {
  const [subcommand, ...rest] = argv;
  try {
    if (subcommand === 'start') return await start(rest);
    if (subcommand === 'stop') return await stop(rest);
    throw new UsageError(subcommand ? `Unknown subcommand: ${subcommand}` : 'Missing subcommand.');
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`${error.message}\n${usage}`);
      return EXIT_USAGE;
    }
    console.error(`server failed: ${(error as Error).message}`);
    return EXIT_FAILED;
  }
}

process.exitCode = await main(process.argv.slice(2));
