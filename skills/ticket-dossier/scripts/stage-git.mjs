#!/usr/bin/env node
// src/skills/ticket-dossier/scripts/stage-git.ts
import { execFile } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
var EXIT_COMPLETE = 0;
var EXIT_GIT_FAILED = 1;
var EXIT_USAGE = 2;
var EXIT_OUT_REFUSED = 3;
var EXIT_NOT_A_REPOSITORY = 4;
var DEFAULT_LIMIT = 50;

class ExitError extends Error {
  code;
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}
var usage = "usage: stage-git --out <dir> --term <t>... [--path <p>...] [--since <date>] [--limit <n>]";
function git(args) {
  return new Promise((resolve, reject) => {
    execFile("git", ["--no-pager", ...args], { maxBuffer: 256 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`git ${args[0]} failed: ${stderr.trim() || error.message}`));
      } else {
        resolve(stdout);
      }
    });
  });
}
function record(source, where, who, when, link, text) {
  const clean = (value) => value.replace(/\s*\|\s*/g, " / ").replace(/\s+/g, " ").trim();
  return `--- source: ${source} | where: ${clean(where)} | who: ${clean(who) || "unknown"} | when: ${when || "unknown"} | link: ${link || "unknown"} ---
${text.replace(/\s+$/, "")}
`;
}
async function commitsForTerm(term, limit, since) {
  const args = [
    "log",
    "--all",
    "-i",
    "--fixed-strings",
    `--grep=${term}`,
    `-n${limit}`,
    "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1f%b%x1e"
  ];
  if (since)
    args.push(`--since=${since}`);
  const output = await git(args);
  return output.split("\x1E").map((chunk) => chunk.replace(/^\n+/, "")).filter((chunk) => chunk.length > 0).map((chunk) => {
    const [hash, short, author, date, subject, body] = chunk.split("\x1F");
    return { hash: hash ?? "", short: short ?? "", author: author ?? "", date: date ?? "", subject: subject ?? "", body: body ?? "", terms: [term] };
  });
}
async function stageCommits(terms, limit, since) {
  const byHash = new Map;
  for (const term of terms) {
    for (const commit of await commitsForTerm(term, limit, since)) {
      const existing = byHash.get(commit.hash);
      if (existing)
        existing.terms.push(term);
      else
        byHash.set(commit.hash, commit);
    }
  }
  return [...byHash.values()].map((commit) => record("git", `${commit.short} (matched: ${commit.terms.join(", ")})`, commit.author, commit.date, commit.hash, `${commit.subject}

${commit.body}`)).join(`
`);
}
function parseBlame(porcelain) {
  const lines = [];
  let current;
  for (const raw of porcelain.split(`
`)) {
    if (raw.startsWith("\t")) {
      if (current)
        lines.push(current);
      current = undefined;
    } else if (!current) {
      const match = /^([0-9a-f]{40}) /.exec(raw);
      if (match)
        current = { hash: match[1] ?? "", author: "unknown", time: 0, summary: "" };
    } else if (raw.startsWith("author ")) {
      current.author = raw.slice("author ".length);
    } else if (raw.startsWith("author-time ")) {
      current.time = Number(raw.slice("author-time ".length));
    } else if (raw.startsWith("summary ")) {
      current.summary = raw.slice("summary ".length);
    }
  }
  return lines;
}
var isoDate = (epochSeconds) => new Date(epochSeconds * 1000).toISOString();
async function blameSummary(path, limit) {
  const lines = parseBlame(await git(["blame", "--line-porcelain", "--", path]));
  if (lines.length === 0)
    return record("blame", path, "unknown", "unknown", "unknown", "no blamed lines");
  const authors = new Map;
  for (const line of lines)
    authors.set(line.author, (authors.get(line.author) ?? 0) + 1);
  const topAuthors = [...authors.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([author, count]) => `${author}: ${count} lines`);
  const ranges = [];
  lines.forEach((line, index) => {
    const last = ranges[ranges.length - 1];
    if (last && last.line.hash === line.hash)
      last.end = index + 1;
    else
      ranges.push({ start: index + 1, end: index + 1, line });
  });
  const recent = [...ranges].sort((a, b) => b.line.time - a.line.time || a.start - b.start).slice(0, limit).sort((a, b) => a.start - b.start);
  const newest = [...lines].sort((a, b) => b.time - a.time)[0];
  if (!newest)
    return record("blame", path, "unknown", "unknown", "unknown", "no blamed lines");
  const text = [
    `total lines: ${lines.length}`,
    `top authors: ${topAuthors.join("; ")}`,
    `most recent commit: ${newest.hash.slice(0, 7)} ${isoDate(newest.time)} ${newest.author}: ${newest.summary}`,
    `ranges (most recent ${recent.length} of ${ranges.length}, by line):`,
    ...recent.map((range) => `  lines ${range.start}-${range.end}: ${range.line.hash.slice(0, 7)} ${isoDate(range.line.time)} ${range.line.author}: ${range.line.summary}`)
  ].join(`
`);
  return record("blame", path, newest.author, isoDate(newest.time), newest.hash, text);
}
function pullRequestReferences(commits) {
  const seen = new Set;
  const blocks = [];
  for (const commit of commits) {
    for (const match of commit.subject.matchAll(/#(\d+)/g)) {
      const key = `${match[1]}:${commit.hash}`;
      if (seen.has(key))
        continue;
      seen.add(key);
      blocks.push(record("pr", `#${match[1]}`, commit.author, commit.date, commit.hash, commit.subject));
    }
  }
  return blocks.join(`
`);
}
async function commitsAcrossTerms(terms, limit, since) {
  const all = [];
  const seen = new Set;
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
async function run(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        out: { type: "string" },
        term: { type: "string", multiple: true },
        path: { type: "string", multiple: true },
        since: { type: "string" },
        limit: { type: "string" }
      },
      strict: true
    }));
  } catch (error) {
    throw new ExitError(`${error.message}
${usage}`, EXIT_USAGE);
  }
  const out = values.out;
  const terms = (values.term ?? []).filter((term) => term.length > 0);
  const paths = values.path ?? [];
  if (!out || terms.length === 0) {
    throw new ExitError(`--out and at least one non-empty --term are required.
${usage}`, EXIT_USAGE);
  }
  const limit = values.limit === undefined ? DEFAULT_LIMIT : Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new ExitError(`--limit must be a positive integer, got "${values.limit}".`, EXIT_USAGE);
  }
  try {
    await git(["rev-parse", "--is-inside-work-tree"]);
  } catch {
    throw new ExitError("The working directory is not inside a git repository.", EXIT_NOT_A_REPOSITORY);
  }
  try {
    const existing = await readdir(out);
    if (existing.length > 0) {
      throw new ExitError(`Refusing to write into non-empty directory ${out}.`, EXIT_OUT_REFUSED);
    }
  } catch (error) {
    if (error instanceof ExitError)
      throw error;
    if (error.code !== "ENOENT") {
      throw new ExitError(`Cannot use --out ${out}: ${error.message}`, EXIT_OUT_REFUSED);
    }
  }
  const commitsText = await stageCommits(terms, limit, values.since);
  const prText = pullRequestReferences(await commitsAcrossTerms(terms, limit, values.since));
  const files = [
    { name: "git-commits.md", content: commitsText },
    { name: "git-prs.md", content: prText }
  ];
  if (paths.length > 0) {
    const blocks = [];
    for (const path of paths)
      blocks.push(await blameSummary(path, limit));
    files.push({ name: "git-blame.md", content: blocks.join(`
`) });
  }
  await mkdir(out, { recursive: true });
  const written = [];
  for (const file of files) {
    const target = join(out, file.name);
    await writeFile(target, file.content, "utf8");
    written.push({
      file: target,
      records: (file.content.match(/^--- source: /gm) ?? []).length
    });
  }
  process.stdout.write(`${JSON.stringify({ out, files: written }, null, 2)}
`);
  return EXIT_COMPLETE;
}
run(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
}, (error) => {
  process.stderr.write(`stage-git: ${error.message}
`);
  process.exitCode = error instanceof ExitError ? error.code : EXIT_GIT_FAILED;
});
