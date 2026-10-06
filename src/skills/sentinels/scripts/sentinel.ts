/**
 * Keys, writes, and checks sentinel marker files.
 *
 *   sentinel key   --version <v> [--input <s>]... [--file <path>]... [--stdin]
 *   sentinel write --dir <dir> --key <key> --status <s> [--claim] [--evidence k=v]...
 *   sentinel check --dir <dir> --key <key> --expect <s> [--max-bytes <n>]
 *
 * The key is a SHA-256 over the procedure version, the inputs (sorted), the digests of the
 * named files (sorted), and stdin when asked. A marker lives at `<dir>/<key>.json`, so a stale
 * marker has a different name and is simply absent. Machine-readable output goes to stdout,
 * diagnostics to stderr, and `check` never prints what it found in the file.
 *
 * Exit codes
 *   key:    0 key printed · 2 a --file could not be read · 64 usage
 *   write:  0 written · 1 claim refused (marker already exists) · 2 write failed · 64 usage
 *   check:  0 valid marker with the expected status · 1 absent or unreadable (missing, symlink,
 *           not a regular file, over the cap, unparseable, wrong schema) · 2 valid marker with a
 *           different status · 3 marker whose embedded key is not the one asked for · 64 usage
 */

import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, type ParseArgsConfig } from 'node:util';

export const SCHEMA_VERSION = 1;
export const STATUSES = ['passed', 'failed', 'blocked', 'aborted'] as const;
export type Status = (typeof STATUSES)[number];
export const DEFAULT_MAX_BYTES = 65_536;

const KEY_PATTERN = /^[0-9a-f]{64}$/;
const EVIDENCE_KEY_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

export function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

export function isKey(value: string): boolean {
  return KEY_PATTERN.test(value);
}

/** The marker's path. The key is validated first, so it can't carry path segments. */
export function markerPath(dir: string, key: string): string {
  if (!isKey(key)) throw new Error(`key must be 64 lowercase hex characters (from \`sentinel key\`), got ${JSON.stringify(key)}`);
  return join(resolve(dir), `${key}.json`);
}

// ---------------------------------------------------------------------------------------------
// key

export interface KeyInputs {
  version: string;
  inputs?: string[];
  fileDigests?: string[];
  stdin?: Buffer;
}

function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Canonical, length-prefixed encoding so `a` + `bc` and `ab` + `c` differ, and inputs and file
 * digests are sorted so the order they're passed in doesn't change the key.
 */
export function computeKey({ version, inputs = [], fileDigests = [], stdin }: KeyInputs): string {
  if (version.length === 0) throw new Error('--version must not be empty');
  const hash = createHash('sha256');
  hash.update('sentinel-key/1\n');
  hash.update(`version:${Buffer.byteLength(version)}:${version}\n`);
  for (const input of [...inputs].sort()) hash.update(`input:${Buffer.byteLength(input)}:${input}\n`);
  for (const digest of [...fileDigests].sort()) hash.update(`file:${digest}\n`);
  if (stdin !== undefined) hash.update(`stdin:${sha256(stdin)}\n`);
  return hash.digest('hex');
}

export function digestFile(path: string): string {
  return sha256(readFileSync(path));
}

// ---------------------------------------------------------------------------------------------
// write

export interface WriteOptions {
  dir: string;
  key: string;
  status: Status;
  claim?: boolean;
  evidence?: Record<string, string>;
  now?: () => string;
}

export type WriteResult =
  | { ok: true; path: string }
  | { ok: false; reason: 'claim-exists' | 'write-failed'; path: string; message: string };

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Writes the payload to a temp file in the same directory (O_EXCL), fsyncs it, then moves it
 * into place. Without `claim`, `rename` replaces whatever is there. With `claim`, `link` is used
 * instead, which fails with EEXIST when the marker already exists, so the first writer wins.
 * The temp file is removed on every failure path.
 */
export function writeMarker({ dir, key, status, claim = false, evidence = {}, now }: WriteOptions): WriteResult {
  const path = markerPath(dir, key);
  const directory = resolve(dir);
  const temp = join(directory, `.tmp-${key.slice(0, 16)}-${process.pid}-${randomBytes(6).toString('hex')}`);
  const payload = {
    schema: SCHEMA_VERSION,
    key,
    status,
    writtenAt: (now ?? (() => new Date().toISOString()))(),
    evidence,
  };

  let fd: number | undefined;
  try {
    fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o644);
    writeSync(fd, `${JSON.stringify(payload, null, 2)}\n`);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    removeQuietly(temp);
    const hint = errorCode(error) === 'ENOENT' ? ` (does ${directory} exist?)` : '';
    return { ok: false, reason: 'write-failed', path, message: `${errorMessage(error)}${hint}` };
  }

  try {
    if (claim) {
      linkSync(temp, path);
    } else {
      renameSync(temp, path);
    }
  } catch (error) {
    removeQuietly(temp);
    if (claim && errorCode(error) === 'EEXIST') {
      return { ok: false, reason: 'claim-exists', path, message: 'a marker for this key already exists; the claim was not taken' };
    }
    return { ok: false, reason: 'write-failed', path, message: errorMessage(error) };
  }

  if (claim) removeQuietly(temp);
  return { ok: true, path };
}

function removeQuietly(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Already gone, or never created.
  }
}

// ---------------------------------------------------------------------------------------------
// check

export type InvalidReason =
  | 'missing'
  | 'symlink'
  | 'not-a-file'
  | 'too-large'
  | 'unreadable'
  | 'unparseable'
  | 'bad-schema'
  | 'bad-status'
  | 'wrong-key'
  | 'wrong-status';

export type CheckResult = { result: 'valid'; status: Status; exitCode: 0 } | { result: 'invalid'; reason: InvalidReason; exitCode: 1 | 2 | 3 };

export interface CheckOptions {
  dir: string;
  key: string;
  expect: Status;
  maxBytes?: number;
}

function invalid(reason: InvalidReason): CheckResult {
  const exitCode = reason === 'wrong-status' ? 2 : reason === 'wrong-key' ? 3 : 1;
  return { result: 'invalid', reason, exitCode };
}

/**
 * Reads defensively: refuses symlinks (lstat, then O_NOFOLLOW), requires a regular file under
 * the size cap (checked on the open descriptor, before reading), parses, and requires the schema
 * version. Everything it can't interpret is reported as a fixed reason code, never as the
 * file's contents, so a marker can't be used to inject text into the caller's context.
 */
export function checkMarker({ dir, key, expect, maxBytes = DEFAULT_MAX_BYTES }: CheckOptions): CheckResult {
  const path = markerPath(dir, key);

  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return invalid('symlink');
    if (!stat.isFile()) return invalid('not-a-file');
  } catch (error) {
    return invalid(errorCode(error) === 'ENOENT' ? 'missing' : 'unreadable');
  }

  let fd: number | undefined;
  let text: string;
  try {
    // O_NOFOLLOW is undefined on Windows; lstat above still rejects links there.
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile()) return invalid('not-a-file');
    if (stat.size > maxBytes) return invalid('too-large');
    const buffer = Buffer.alloc(maxBytes + 1);
    const read = readSync(fd, buffer, 0, buffer.length, 0);
    if (read > maxBytes) return invalid('too-large');
    text = buffer.subarray(0, read).toString('utf8');
  } catch (error) {
    return invalid(errorCode(error) === 'ELOOP' ? 'symlink' : 'unreadable');
  } finally {
    if (fd !== undefined) closeSync(fd);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return invalid('unparseable');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return invalid('bad-schema');
  const record = parsed as Record<string, unknown>;
  if (record.schema !== SCHEMA_VERSION) return invalid('bad-schema');
  if (typeof record.status !== 'string' || !isStatus(record.status)) return invalid('bad-status');
  if (record.key !== key) return invalid('wrong-key');
  if (record.status !== expect) return invalid('wrong-status');

  return { result: 'valid', status: expect, exitCode: 0 };
}

// ---------------------------------------------------------------------------------------------
// CLI

const USAGE = `usage:
  sentinel key   --version <v> [--input <s>]... [--file <path>]... [--stdin]
  sentinel write --dir <dir> --key <key> --status passed|failed|blocked|aborted [--claim] [--evidence k=v]...
  sentinel check --dir <dir> --key <key> --expect passed|failed|blocked|aborted [--max-bytes <n>]`;

class UsageError extends Error {}

function readStdin(): Buffer {
  const chunks: Buffer[] = [];
  const buffer = Buffer.alloc(65_536);
  for (;;) {
    let read: number;
    try {
      read = readSync(0, buffer, 0, buffer.length, null);
    } catch (error) {
      if (errorCode(error) === 'EAGAIN') continue;
      if (errorCode(error) === 'EOF') break;
      throw error;
    }
    if (read === 0) break;
    chunks.push(Buffer.from(buffer.subarray(0, read)));
  }
  return Buffer.concat(chunks);
}

function parse<T extends ParseArgsConfig>(config: T): ReturnType<typeof parseArgs<T>> {
  try {
    return parseArgs(config);
  } catch (error) {
    throw new UsageError(errorMessage(error));
  }
}

function requireString(values: Record<string, unknown>, name: string): string {
  const value = values[name];
  if (typeof value !== 'string' || value.length === 0) throw new UsageError(`--${name} is required`);
  return value;
}

function requireStatus(values: Record<string, unknown>, name: string): Status {
  const value = requireString(values, name);
  if (!isStatus(value)) throw new UsageError(`--${name} must be one of ${STATUSES.join(', ')}`);
  return value;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function runKey(args: string[]): number {
  const { values } = parse({
    args,
    options: {
      version: { type: 'string' },
      input: { type: 'string', multiple: true },
      file: { type: 'string', multiple: true },
      stdin: { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  });

  const version = requireString(values, 'version');
  const fileDigests: string[] = [];
  for (const file of strings(values.file)) {
    try {
      fileDigests.push(digestFile(file));
    } catch (error) {
      console.error(`sentinel key: cannot read --file ${file}: ${errorMessage(error)}`);
      return 2;
    }
  }

  const key = computeKey({
    version,
    inputs: strings(values.input),
    fileDigests,
    stdin: values.stdin ? readStdin() : undefined,
  });
  process.stdout.write(`${key}\n`);
  return 0;
}

function runWrite(args: string[]): number {
  const { values } = parse({
    args,
    options: {
      dir: { type: 'string' },
      key: { type: 'string' },
      status: { type: 'string' },
      claim: { type: 'boolean' },
      evidence: { type: 'string', multiple: true },
    },
    strict: true,
    allowPositionals: false,
  });

  const dir = requireString(values, 'dir');
  const key = requireString(values, 'key');
  if (!isKey(key)) throw new UsageError('--key must be 64 lowercase hex characters, as printed by `sentinel key`');
  const status = requireStatus(values, 'status');

  const evidence: Record<string, string> = {};
  for (const pair of strings(values.evidence)) {
    const separator = pair.indexOf('=');
    const name = separator === -1 ? '' : pair.slice(0, separator);
    if (!EVIDENCE_KEY_PATTERN.test(name)) throw new UsageError(`--evidence expects name=value with a name matching ${EVIDENCE_KEY_PATTERN}, got ${JSON.stringify(pair)}`);
    evidence[name] = pair.slice(separator + 1);
  }

  const result = writeMarker({ dir, key, status, claim: values.claim === true, evidence });
  if (result.ok) {
    process.stdout.write(`${JSON.stringify({ result: 'written', path: result.path, status, claimed: values.claim === true })}\n`);
    return 0;
  }

  process.stdout.write(`${JSON.stringify({ result: result.reason, path: result.path })}\n`);
  console.error(`sentinel write: ${result.message}`);
  return result.reason === 'claim-exists' ? 1 : 2;
}

function runCheck(args: string[]): number {
  const { values } = parse({
    args,
    options: {
      dir: { type: 'string' },
      key: { type: 'string' },
      expect: { type: 'string' },
      'max-bytes': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });

  const dir = requireString(values, 'dir');
  const key = requireString(values, 'key');
  if (!isKey(key)) throw new UsageError('--key must be 64 lowercase hex characters, as printed by `sentinel key`');
  const expect = requireStatus(values, 'expect');

  let maxBytes = DEFAULT_MAX_BYTES;
  if (typeof values['max-bytes'] === 'string') {
    maxBytes = Number(values['max-bytes']);
    if (!Number.isInteger(maxBytes) || maxBytes <= 0) throw new UsageError('--max-bytes must be a positive integer');
  }

  const result = checkMarker({ dir, key, expect, maxBytes });
  if (result.result === 'valid') {
    process.stdout.write(`${JSON.stringify({ result: 'valid', status: expect })}\n`);
  } else {
    process.stdout.write(`${JSON.stringify({ result: 'invalid', reason: result.reason })}\n`);
  }
  return result.exitCode;
}

export function main(argv: string[]): number {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case 'key':
        return runKey(rest);
      case 'write':
        return runWrite(rest);
      case 'check':
        return runCheck(rest);
      default:
        throw new UsageError(command === undefined ? 'a subcommand is required' : `unknown subcommand ${JSON.stringify(command)}`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`sentinel: ${error.message}\n${USAGE}`);
      return 64;
    }
    console.error(`sentinel: ${errorMessage(error)}`);
    return 2;
  }
}

/** True when this file is the process entry point, so importing it from a test runs nothing. */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) process.exitCode = main(process.argv.slice(2));
