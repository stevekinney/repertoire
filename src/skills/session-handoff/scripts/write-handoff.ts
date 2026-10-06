import { randomBytes } from 'node:crypto';
import { lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** Exit codes: 0 written, 1 I/O failure, 2 bad usage, 3 refused input, 4 refused target. */
export const EXIT = { ok: 0, failure: 1, usage: 2, refusedInput: 3, refusedTarget: 4 } as const;

export class HandoffError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}

export type Action = 'created' | 'replaced' | 'appended';

export interface Options {
  file: string;
  section: string;
  verifiedAt: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

export function parseArgs(argv: string[]): Options {
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!['--file', '--section', '--verified-at'].includes(flag ?? '')) {
      throw new HandoffError(`Unknown argument: ${flag}`, EXIT.usage);
    }
    if (value === undefined || value.startsWith('--')) {
      throw new HandoffError(`${flag} needs a value`, EXIT.usage);
    }
    values[flag as string] = value;
  }
  const file = values['--file'];
  const verifiedAt = values['--verified-at'];
  const section = values['--section'] ?? 'handoff';
  if (!file) throw new HandoffError('--file <path> is required', EXIT.usage);
  if (!verifiedAt) {
    throw new HandoffError('--verified-at <ISO time> is required (the script never reads the clock)', EXIT.usage);
  }
  if (!ISO.test(verifiedAt) || Number.isNaN(Date.parse(verifiedAt))) {
    throw new HandoffError(`--verified-at is not an ISO date or time: ${verifiedAt}`, EXIT.usage);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(section)) {
    throw new HandoffError(`--section must be letters, digits, '-' or '_': ${section}`, EXIT.usage);
  }
  return { file, section, verifiedAt };
}

function entryOf(path: string): ReturnType<typeof lstatSync> | undefined {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Builds the section: markers, a verification stamp, then the body without any markers of its own. */
export function buildSection(body: string, section: string, verifiedAt: string): string {
  const start = `<!-- ${section}:start -->`;
  const end = `<!-- ${section}:end -->`;
  let inner = body;
  const s = inner.indexOf(start);
  const e = inner.lastIndexOf(end);
  if (s !== -1 && e > s) inner = inner.slice(s + start.length, e);
  inner = inner.split(start).join('').split(end).join('').trim();
  if (!inner) throw new HandoffError('Input is empty after removing markers', EXIT.refusedInput);
  return `${start}\n<!-- ${section}:verified-at ${verifiedAt} -->\n\n${inner}\n\n${end}`;
}

/** Pure merge: returns the new file text and what happened. */
export function merge(
  existing: string | undefined,
  block: string,
  section: string,
): { text: string; action: Action } {
  if (existing === undefined) return { text: `${block}\n`, action: 'created' };
  const start = `<!-- ${section}:start -->`;
  const end = `<!-- ${section}:end -->`;
  const starts = existing.split(start).length - 1;
  const ends = existing.split(end).length - 1;
  if (starts === 0 && ends === 0) {
    const base = existing.replace(/\s+$/, '');
    return { text: base ? `${base}\n\n${block}\n` : `${block}\n`, action: 'appended' };
  }
  const s = existing.indexOf(start);
  const e = existing.indexOf(end);
  if (starts !== 1 || ends !== 1 || e < s) {
    throw new HandoffError(
      `Existing ${section} markers are malformed (${starts} start, ${ends} end, or out of order). Fix the file by hand; nothing was written.`,
      EXIT.refusedTarget,
    );
  }
  return {
    text: existing.slice(0, s) + block + existing.slice(e + end.length),
    action: 'replaced',
  };
}

export function writeHandoff(options: Options, body: string): { path: string; action: Action } {
  if (!body.trim()) throw new HandoffError('Refusing empty input on stdin', EXIT.refusedInput);
  const stat = entryOf(options.file);
  if (stat?.isSymbolicLink()) {
    throw new HandoffError(`Refusing to write through a symlink: ${options.file}`, EXIT.refusedTarget);
  }
  if (stat && !stat.isFile()) {
    throw new HandoffError(`Not a regular file: ${options.file}`, EXIT.refusedTarget);
  }
  const existing = stat ? readFileSync(options.file, 'utf8') : undefined;
  const block = buildSection(body, options.section, options.verifiedAt);
  const { text, action } = merge(existing, block, options.section);

  const directory = dirname(options.file);
  mkdirSync(directory, { recursive: true });
  const temporary = join(directory, `.${basename(options.file)}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    writeFileSync(temporary, text, { flag: 'wx', mode: stat ? Number(stat.mode) & 0o777 : 0o644 });
    renameSync(temporary, options.file);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // The temp file may never have been created.
    }
    throw error;
  }
  return { path: options.file, action };
}

function main(): number {
  try {
    const options = parseArgs(process.argv.slice(2));
    const body = readFileSync(0, 'utf8');
    process.stdout.write(`${JSON.stringify(writeHandoff(options, body))}\n`);
    return EXIT.ok;
  } catch (error) {
    if (error instanceof HandoffError) {
      process.stderr.write(`write-handoff: ${error.message}\n`);
      return error.code;
    }
    process.stderr.write(`write-handoff: ${(error as Error).message}\n`);
    return EXIT.failure;
  }
}

if (import.meta.main !== false && /write-handoff\.(ts|mjs)$/.test(process.argv[1] ?? '')) {
  process.exitCode = main();
}
