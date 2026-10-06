import { execFile } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export type FindingKind =
  | 'test-file-deleted'
  | 'assertion-removed'
  | 'test-skipped'
  | 'expected-value-edited'
  | 'lint-or-type-rule-disabled'
  | 'threshold-lowered'
  | 'snapshot-updated';

export type Finding = { kind: FindingKind; file: string; line: number; text: string };

type Change = { line: number; text: string };
type Hunk = { file: string; removed: Change[]; added: Change[] };
type FileInfo = { deleted: boolean };

const TEST_FILE =
  /(^|\/)(tests?|__tests__|specs?)\/|[._-](test|spec)\.[a-z0-9]+$|(^|\/)test_[^/]+\.py$|_test\.(go|py|rb|rs)$/i;
const SNAPSHOT_FILE = /\.snap(\.[a-z0-9]+)?$|(^|\/)__snapshots__\/|\.ambr$/i;
const CONFIG_FILE =
  /(config|rc)(\.[a-z0-9]+)?$|\.(ya?ml|toml|cfg|ini|json)$|(^|\/)(codecov|\.coveragerc|\.nycrc|setup\.cfg|pyproject\.toml)/i;
const LOCK_FILE = /(lock|\.lockb)$|lock\.(json|ya?ml)$/i;
const CODE_FILE =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|scala|sh)$/i;

const ASSERTION =
  /\b(expect|assert\w*|should|verify)\s*[.(]|\b(toBe\w*|toEqual|toStrictEqual|toMatch\w*|toThrow\w*|toHaveBeen\w+|toContain\w*|toHaveLength|assertEquals?|assertThat|assertTrue|assertFalse)\b|\bself\.assert\w+|^\s*assert\s/;
const SKIP =
  /\b(it|test|describe|context|suite)\.(skip|only|todo|failing)\b|(^|[^.\w])(xit|xdescribe|xtest|fit|fdescribe|ftest)\s*\(|@pytest\.mark\.(skip|skipif|xfail)|\bpytest\.(skip|xfail)\(|\bt\.Skip(Now)?\(|@Disabled\b|@Ignore\b|\bunittest\.skip|#\[ignore\]/;
const RULE_DISABLED =
  /eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck|#\s*noqa|#\s*type:\s*ignore|biome-ignore|#\s*pylint:\s*disable|rubocop:disable|\/\/\s*nolint|@SuppressWarnings|#\s*nosec\b/;
const THRESHOLD =
  /["']?([\w.-]*(threshold|coverage|fail[_-]?under|branches|lines|functions|statements|minimum|min[_-]?score)[\w.-]*)["']?\s*[:=]\s*(\d+(?:\.\d+)?)/i;

export const isTestFile = (file: string): boolean => TEST_FILE.test(file);

/** Parse a unified diff. Added lines carry new-file numbers, removed lines carry old-file numbers. */
export function parseDiff(diff: string): { hunks: Hunk[]; files: Map<string, FileInfo> } {
  const hunks: Hunk[] = [];
  const files = new Map<string, FileInfo>();
  let file = '';
  let oldPath = '';
  let current: Hunk | undefined;
  let oldLeft = 0;
  let newLeft = 0;
  let oldLine = 0;
  let newLine = 0;

  for (const raw of diff.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const inHunk = oldLeft > 0 || newLeft > 0;

    if (inHunk && current) {
      const marker = line[0];
      const body = line.slice(1);
      if (marker === '+') {
        current.added.push({ line: newLine, text: body });
        newLine++;
        newLeft--;
        continue;
      }
      if (marker === '-') {
        current.removed.push({ line: oldLine, text: body });
        oldLine++;
        oldLeft--;
        continue;
      }
      if (marker === ' ' || line === '') {
        oldLine++;
        newLine++;
        oldLeft--;
        newLeft--;
        continue;
      }
      if (marker === '\\') continue;
    }

    const git = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (git) {
      file = git[2] ?? '';
      oldPath = git[1] ?? '';
      files.set(file, { deleted: false });
      current = undefined;
      continue;
    }
    if (line.startsWith('deleted file mode')) {
      const info = files.get(file);
      if (info) info.deleted = true;
      continue;
    }
    if (line.startsWith('--- ')) {
      const p = line.slice(4).replace(/^a\//, '');
      if (p !== '/dev/null') oldPath = p;
      continue;
    }
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).replace(/^b\//, '');
      file = p === '/dev/null' ? oldPath : p;
      if (!files.has(file)) files.set(file, { deleted: p === '/dev/null' });
      else if (p === '/dev/null') files.get(file)!.deleted = true;
      continue;
    }
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (header && file) {
      oldLine = Number(header[1]);
      oldLeft = header[2] === undefined ? 1 : Number(header[2]);
      newLine = Number(header[3]);
      newLeft = header[4] === undefined ? 1 : Number(header[4]);
      current = { file, removed: [], added: [] };
      hunks.push(current);
    }
  }
  return { hunks, files };
}

const clip = (text: string): string => {
  const t = text.trim();
  return t.length > 200 ? `${t.slice(0, 197)}...` : t;
};

export function scanDiff(diff: string): Finding[] {
  const { hunks, files } = parseDiff(diff);
  const findings: Finding[] = [];
  const add = (kind: FindingKind, file: string, c: Change) =>
    findings.push({ kind, file, line: c.line, text: clip(c.text) });

  const sourceChanged = hunks.some(
    (h) =>
      CODE_FILE.test(h.file) && !isTestFile(h.file) && !SNAPSHOT_FILE.test(h.file),
  );

  for (const [file, info] of files) {
    if (info.deleted && isTestFile(file) && !SNAPSHOT_FILE.test(file)) {
      findings.push({ kind: 'test-file-deleted', file, line: 1, text: 'test file deleted' });
    }
  }

  const snapshotSeen = new Set<string>();
  for (const hunk of hunks) {
    const { file } = hunk;
    const deleted = files.get(file)?.deleted === true;

    if (SNAPSHOT_FILE.test(file)) {
      if (!snapshotSeen.has(file)) {
        snapshotSeen.add(file);
        const first = hunk.added[0] ?? hunk.removed[0];
        if (first) add('snapshot-updated', file, first);
      }
      continue;
    }

    for (const c of hunk.added) {
      if (RULE_DISABLED.test(c.text)) add('lint-or-type-rule-disabled', file, c);
    }

    if (isTestFile(file)) {
      for (const c of hunk.added) if (SKIP.test(c.text)) add('test-skipped', file, c);
      if (!deleted) {
        const removed = hunk.removed.filter((c) => ASSERTION.test(c.text));
        const added = hunk.added.filter((c) => ASSERTION.test(c.text));
        const paired = Math.min(removed.length, added.length);
        for (const c of removed.slice(paired)) add('assertion-removed', file, c);
        if (sourceChanged) {
          for (const c of added.slice(0, paired)) add('expected-value-edited', file, c);
        }
      }
    }

    if (CONFIG_FILE.test(file) && !LOCK_FILE.test(file) && !isTestFile(file)) {
      const before = new Map<string, number>();
      for (const c of hunk.removed) {
        const m = THRESHOLD.exec(c.text);
        if (m?.[1] && m[3]) before.set(m[1].toLowerCase(), Number(m[3]));
      }
      for (const c of hunk.added) {
        const m = THRESHOLD.exec(c.text);
        const old = m?.[1] ? before.get(m[1].toLowerCase()) : undefined;
        if (m?.[3] && old !== undefined && Number(m[3]) < old) add('threshold-lowered', file, c);
      }
    }
  }
  return findings;
}

type Options = { base?: string; stdin: boolean; help: boolean };

export function parseArgs(argv: string[]): Options {
  const options: Options = { stdin: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--stdin') options.stdin = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--base') {
      const value = argv[++i];
      if (!value || value.startsWith('-')) throw new Error('--base needs a git ref');
      options.base = value;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (options.stdin && options.base) throw new Error('--stdin and --base are mutually exclusive');
  return options;
}

const USAGE = 'usage: scan-diff [--base <ref> | --stdin]\n';

function gitDiff(base: string | undefined): Promise<string> {
  const args = ['diff', '--no-color', '--no-ext-diff', base ?? 'HEAD', '--'];
  return new Promise((resolve, reject) => {
    execFile('git', args, { maxBuffer: 256 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`git ${args.join(' ')} failed: ${stderr.trim() || error.message}`));
      else resolve(stdout);
    });
  });
}

export async function main(argv: string[]): Promise<number> {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      process.stderr.write(USAGE);
      return 0;
    }
    const diff = options.stdin ? readFileSync(0, 'utf8') : await gitDiff(options.base);
    const findings = scanDiff(diff);
    process.stdout.write(`${JSON.stringify({ findings }, null, 2)}\n`);
    process.stderr.write(`scan-diff: ${findings.length} finding(s)\n`);
    return findings.length > 0 ? 1 : 0;
  } catch (error) {
    process.stderr.write(`scan-diff: ${error instanceof Error ? error.message : String(error)}\n`);
    process.stderr.write(USAGE);
    return 2;
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  process.exitCode = await main(process.argv.slice(2));
}
