import { execFile } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const EXIT_COMPLETE = 0;
const EXIT_GIT_FAILED = 1;
const EXIT_USAGE = 2;
const EXIT_OUT_REFUSED = 3;
const EXIT_NOT_A_REPOSITORY = 4;

const DEFAULT_LIMIT = 50;

class ExitError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}

const usage =
  'usage: stage-git --out <dir> --term <t>... [--path <p>...] [--since <date>] [--limit <n>]';

/** Runs read-only git with an argument array and no shell. */
function git(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['--no-pager', ...args],
      { maxBuffer: 256 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`git ${args[0]} failed: ${stderr.trim() || error.message}`));
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

type Commit = {
  hash: string;
  short: string;
  author: string;
  date: string;
  subject: string;
  body: string;
  terms: string[];
};

/** One staging record, in the block format that references/sources.md defines. */
function record(
  source: string,
  where: string,
  who: string,
  when: string,
  link: string,
  text: string,
): string {
  const clean = (value: string) => value.replace(/\s*\|\s*/g, ' / ').replace(/\s+/g, ' ').trim();
  return `--- source: ${source} | where: ${clean(where)} | who: ${clean(who) || 'unknown'} | when: ${when || 'unknown'} | link: ${link || 'unknown'} ---\n${text.replace(/\s+$/, '')}\n`;
}

async function commitsForTerm(term: string, limit: number, since?: string): Promise<Commit[]> {
  const args = [
    'log',
    '--all',
    '-i',
    '--fixed-strings',
    `--grep=${term}`,
    `-n${limit}`,
    '--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1f%b%x1e',
  ];
  if (since) args.push(`--since=${since}`);
  const output = await git(args);
  return output
    .split('\x1e')
    .map((chunk) => chunk.replace(/^\n+/, ''))
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      const [hash, short, author, date, subject, body] = chunk.split('\x1f');
      return { hash: hash ?? '', short: short ?? '', author: author ?? '', date: date ?? '', subject: subject ?? '', body: body ?? '', terms: [term] };
    });
}

async function stageCommits(terms: string[], limit: number, since?: string): Promise<string> {
  const byHash = new Map<string, Commit>();
  for (const term of terms) {
    for (const commit of await commitsForTerm(term, limit, since)) {
      const existing = byHash.get(commit.hash);
      if (existing) existing.terms.push(term);
      else byHash.set(commit.hash, commit);
    }
  }
  return [...byHash.values()]
    .map((commit) =>
      record(
        'git',
        `${commit.short} (matched: ${commit.terms.join(', ')})`,
        commit.author,
        commit.date,
        commit.hash,
        `${commit.subject}\n\n${commit.body}`,
      ),
    )
    .join('\n');
}

type BlameLine = { hash: string; author: string; time: number; summary: string };

function parseBlame(porcelain: string): BlameLine[] {
  const lines: BlameLine[] = [];
  let current: BlameLine | undefined;
  for (const raw of porcelain.split('\n')) {
    if (raw.startsWith('\t')) {
      if (current) lines.push(current);
      current = undefined;
    } else if (!current) {
      const match = /^([0-9a-f]{40}) /.exec(raw);
      if (match) current = { hash: match[1] ?? '', author: 'unknown', time: 0, summary: '' };
    } else if (raw.startsWith('author ')) {
      current.author = raw.slice('author '.length);
    } else if (raw.startsWith('author-time ')) {
      current.time = Number(raw.slice('author-time '.length));
    } else if (raw.startsWith('summary ')) {
      current.summary = raw.slice('summary '.length);
    }
  }
  return lines;
}

const isoDate = (epochSeconds: number) => new Date(epochSeconds * 1000).toISOString();

async function blameSummary(path: string, limit: number): Promise<string> {
  const lines = parseBlame(await git(['blame', '--line-porcelain', '--', path]));
  if (lines.length === 0) return record('blame', path, 'unknown', 'unknown', 'unknown', 'no blamed lines');

  const authors = new Map<string, number>();
  for (const line of lines) authors.set(line.author, (authors.get(line.author) ?? 0) + 1);
  const topAuthors = [...authors.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([author, count]) => `${author}: ${count} lines`);

  const ranges: { start: number; end: number; line: BlameLine }[] = [];
  lines.forEach((line, index) => {
    const last = ranges[ranges.length - 1];
    if (last && last.line.hash === line.hash) last.end = index + 1;
    else ranges.push({ start: index + 1, end: index + 1, line });
  });
  const recent = [...ranges]
    .sort((a, b) => b.line.time - a.line.time || a.start - b.start)
    .slice(0, limit)
    .sort((a, b) => a.start - b.start);
  const newest = [...lines].sort((a, b) => b.time - a.time)[0];
  if (!newest) return record('blame', path, 'unknown', 'unknown', 'unknown', 'no blamed lines');

  const text = [
    `total lines: ${lines.length}`,
    `top authors: ${topAuthors.join('; ')}`,
    `most recent commit: ${newest.hash.slice(0, 7)} ${isoDate(newest.time)} ${newest.author}: ${newest.summary}`,
    `ranges (most recent ${recent.length} of ${ranges.length}, by line):`,
    ...recent.map(
      (range) =>
        `  lines ${range.start}-${range.end}: ${range.line.hash.slice(0, 7)} ${isoDate(range.line.time)} ${range.line.author}: ${range.line.summary}`,
    ),
  ].join('\n');
  return record('blame', path, newest.author, isoDate(newest.time), newest.hash, text);
}

function pullRequestReferences(commits: Commit[]): string {
  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const commit of commits) {
    for (const match of commit.subject.matchAll(/#(\d+)/g)) {
      const key = `${match[1]}:${commit.hash}`;
      if (seen.has(key)) continue;
      seen.add(key);
      blocks.push(
        record('pr', `#${match[1]}`, commit.author, commit.date, commit.hash, commit.subject),
      );
    }
  }
  return blocks.join('\n');
}

async function commitsAcrossTerms(terms: string[], limit: number, since?: string) {
  const all: Commit[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    for (const commit of await commitsForTerm(term, limit, since)) {
      if (!seen.has(commit.hash)) {
        seen.add(commit.hash);
        all.push(commit);
      }
    }
  }
  return all;
}

async function run(argv: string[]): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        out: { type: 'string' },
        term: { type: 'string', multiple: true },
        path: { type: 'string', multiple: true },
        since: { type: 'string' },
        limit: { type: 'string' },
      },
      strict: true,
    }));
  } catch (error) {
    throw new ExitError(`${(error as Error).message}\n${usage}`, EXIT_USAGE);
  }

  const out = values.out;
  const terms = (values.term ?? []).filter((term) => term.length > 0);
  const paths = values.path ?? [];
  if (!out || terms.length === 0) {
    throw new ExitError(`--out and at least one non-empty --term are required.\n${usage}`, EXIT_USAGE);
  }
  const limit = values.limit === undefined ? DEFAULT_LIMIT : Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new ExitError(`--limit must be a positive integer, got "${values.limit}".`, EXIT_USAGE);
  }

  try {
    await git(['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new ExitError('The working directory is not inside a git repository.', EXIT_NOT_A_REPOSITORY);
  }

  try {
    const existing = await readdir(out);
    if (existing.length > 0) {
      throw new ExitError(`Refusing to write into non-empty directory ${out}.`, EXIT_OUT_REFUSED);
    }
  } catch (error) {
    if (error instanceof ExitError) throw error;
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new ExitError(`Cannot use --out ${out}: ${(error as Error).message}`, EXIT_OUT_REFUSED);
    }
  }

  // Gather everything before writing so a git failure leaves --out untouched.
  const commitsText = await stageCommits(terms, limit, values.since);
  const prText = pullRequestReferences(await commitsAcrossTerms(terms, limit, values.since));
  const files: { name: string; content: string }[] = [
    { name: 'git-commits.md', content: commitsText },
    { name: 'git-prs.md', content: prText },
  ];
  if (paths.length > 0) {
    const blocks: string[] = [];
    for (const path of paths) blocks.push(await blameSummary(path, limit));
    files.push({ name: 'git-blame.md', content: blocks.join('\n') });
  }

  await mkdir(out, { recursive: true });
  const written = [];
  for (const file of files) {
    const target = join(out, file.name);
    await writeFile(target, file.content, 'utf8');
    written.push({
      file: target,
      records: (file.content.match(/^--- source: /gm) ?? []).length,
    });
  }
  process.stdout.write(`${JSON.stringify({ out, files: written }, null, 2)}\n`);
  return EXIT_COMPLETE;
}

run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`stage-git: ${(error as Error).message}\n`);
    process.exitCode = error instanceof ExitError ? error.code : EXIT_GIT_FAILED;
  },
);
