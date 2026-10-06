#!/usr/bin/env node
// src/skills/pr-shepherd/scripts/status.ts
import { execFile } from "node:child_process";

class ExitError extends Error {
  code;
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}
var run = (args) => new Promise((resolve) => {
  execFile("gh", args, { maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (!error)
      return resolve({ code: 0, stdout, stderr, missing: false });
    const failure = error;
    if (failure.code === "ENOENT")
      return resolve({ code: 127, stdout, stderr, missing: true });
    const code = typeof failure.code === "number" ? failure.code : 1;
    resolve({ code, stdout, stderr, missing: false });
  });
});
var parseJson = (text, what) => {
  try {
    return JSON.parse(text);
  } catch {
    throw new ExitError(`Could not parse the JSON from ${what}.`, 3);
  }
};
var asRecord = (value) => value && typeof value === "object" ? value : {};
var THREADS_QUERY = `query($owner:String!,$repo:String!,$pr:Int!,$after:String){
  repository(owner:$owner,name:$repo){ pullRequest(number:$pr){
    reviewThreads(first:100,after:$after){
      pageInfo{ hasNextPage endCursor }
      nodes{ id isResolved path line comments(last:1){ nodes{ author{login} body } } }
    } } } }`;
async function fetchThreads(owner, repo, pr) {
  const threads = [];
  let after = null;
  for (let page = 0;page < 1000; page += 1) {
    const args = [
      "api",
      "graphql",
      "-f",
      `owner=${owner}`,
      "-f",
      `repo=${repo}`,
      "-F",
      `pr=${pr}`,
      "-f",
      `query=${THREADS_QUERY}`
    ];
    if (after)
      args.push("-f", `after=${after}`);
    const result = await run(args);
    if (result.code !== 0) {
      throw new ExitError(`gh api graphql failed: ${result.stderr.trim() || result.code}`, 3);
    }
    const root = asRecord(parseJson(result.stdout, "gh api graphql"));
    const connection = asRecord(asRecord(asRecord(asRecord(root.data).repository).pullRequest).reviewThreads);
    if (!Array.isArray(connection.nodes)) {
      throw new ExitError("gh api graphql returned no reviewThreads for this pull request.", 3);
    }
    for (const raw of connection.nodes) {
      const node = asRecord(raw);
      if (node.isResolved === true)
        continue;
      const comments = asRecord(node.comments).nodes;
      const last = asRecord(Array.isArray(comments) ? comments[comments.length - 1] : undefined);
      const login = asRecord(last.author).login;
      threads.push({
        id: String(node.id),
        path: typeof node.path === "string" ? node.path : null,
        line: typeof node.line === "number" ? node.line : null,
        author: typeof login === "string" ? login : null,
        body: typeof last.body === "string" ? last.body : ""
      });
    }
    const pageInfo = asRecord(connection.pageInfo);
    if (pageInfo.hasNextPage !== true)
      return threads;
    if (typeof pageInfo.endCursor !== "string") {
      throw new ExitError("gh api graphql reported another page without a cursor.", 3);
    }
    after = pageInfo.endCursor;
  }
  throw new ExitError("Too many review thread pages.", 3);
}
var PASSING_BUCKETS = new Set(["pass", "skipping"]);
var PASSING_STATES = new Set(["SUCCESS", "SKIPPED", "NEUTRAL"]);
async function main(argv) {
  if (argv.length > 1 || argv[0]?.startsWith("-")) {
    throw new ExitError("Usage: status [<pr>]  (a PR number, URL, or branch)", 3);
  }
  const selector = argv.length === 1 ? [argv[0]] : [];
  const auth = await run(["auth", "status"]);
  if (auth.missing)
    throw new ExitError("gh is not installed. Install the GitHub CLI.", 2);
  if (auth.code !== 0)
    throw new ExitError("gh is not authenticated. Run: gh auth login", 2);
  const view = await run([
    "pr",
    "view",
    ...selector,
    "--json",
    "number,url,state,mergeable,mergeStateStatus,headRefOid"
  ]);
  if (view.code !== 0) {
    throw new ExitError(`gh pr view failed: ${view.stderr.trim() || view.code}`, 3);
  }
  const pr = asRecord(parseJson(view.stdout, "gh pr view"));
  const number = pr.number;
  const match = /github\.com\/([^/]+)\/([^/]+)\/pull\//.exec(String(pr.url ?? ""));
  if (typeof number !== "number" || !match) {
    throw new ExitError("gh pr view did not return a pull request number and URL.", 3);
  }
  if (pr.state !== "OPEN") {
    throw new ExitError(`Pull request #${number} is ${String(pr.state)}, not OPEN.`, 3);
  }
  const checksRun = await run([
    "pr",
    "checks",
    String(number),
    "--json",
    "name,state,bucket"
  ]);
  let checksRaw = [];
  if (checksRun.stdout.trim()) {
    checksRaw = parseJson(checksRun.stdout, "gh pr checks");
  } else if (checksRun.code !== 0 && !/no checks reported/i.test(checksRun.stderr)) {
    throw new ExitError(`gh pr checks failed: ${checksRun.stderr.trim() || checksRun.code}`, 3);
  }
  if (!Array.isArray(checksRaw))
    throw new ExitError("gh pr checks returned non-array JSON.", 3);
  const checks = [];
  let allPassed = true;
  for (const raw of checksRaw) {
    const item = asRecord(raw);
    const state = String(item.state ?? "UNKNOWN");
    checks.push({ name: String(item.name ?? ""), state });
    const bucket = typeof item.bucket === "string" ? item.bucket : null;
    const passed = bucket ? PASSING_BUCKETS.has(bucket) : PASSING_STATES.has(state.toUpperCase());
    if (!passed)
      allPassed = false;
  }
  const unresolvedThreads = await fetchThreads(match[1], match[2], number);
  const mergeable = String(pr.mergeable ?? "UNKNOWN");
  const conflicts = mergeable === "CONFLICTING" || pr.mergeStateStatus === "DIRTY";
  if (mergeable === "UNKNOWN") {
    console.error("mergeable is UNKNOWN (GitHub is still computing it); re-run in a few seconds.");
  }
  const ready = allPassed && !conflicts && mergeable !== "UNKNOWN" && unresolvedThreads.length === 0;
  console.log(JSON.stringify({ checks, mergeable, conflicts, unresolvedThreads, ready }, null, 2));
  return ready ? 0 : 1;
}
main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
}, (error) => {
  if (error instanceof ExitError) {
    console.error(error.message);
    process.exitCode = error.code;
  } else {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 3;
  }
});
