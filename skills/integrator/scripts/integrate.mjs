#!/usr/bin/env node
// src/skills/integrator/scripts/integrate.ts
import { spawnSync } from "node:child_process";
var EXIT_OK = 0;
var EXIT_USAGE = 2;
var EXIT_CANNOT_PLAN = 3;

class PlanError extends Error {
  exitCode;
  constructor(message, exitCode) {
    super(message);
    this.exitCode = exitCode;
  }
}
function git(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (result.error) {
    throw new PlanError(`Could not run git: ${result.error.message}`, EXIT_CANNOT_PLAN);
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
function gitOrThrow(repo, args) {
  const result = git(repo, args);
  if (result.status !== 0) {
    throw new PlanError(`git ${args.join(" ")} failed (exit ${result.status}): ${result.stderr.trim()}`, EXIT_CANNOT_PLAN);
  }
  return result.stdout;
}
function supportsMergeTree(repo) {
  const match = /(\d+)\.(\d+)/.exec(git(repo, ["version"]).stdout);
  if (!match)
    return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 2 || major === 2 && minor >= 38;
}
function verifyCommit(repo, ref) {
  const result = git(repo, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  if (result.status !== 0) {
    throw new PlanError(`Not a commit or branch in this repository: ${ref}`, EXIT_CANNOT_PLAN);
  }
}
function predict(repo, base, branch) {
  const result = git(repo, [
    "merge-tree",
    "--write-tree",
    "--name-only",
    "--no-messages",
    base,
    branch
  ]);
  if (result.status === 0)
    return { prediction: "clean", conflictingFiles: [] };
  if (result.status === 1) {
    const lines = result.stdout.split(`
`).slice(1);
    const end = lines.indexOf("");
    const files = (end === -1 ? lines : lines.slice(0, end)).filter(Boolean);
    return { prediction: "conflict", conflictingFiles: [...new Set(files)].sort() };
  }
  return { prediction: "unknown", conflictingFiles: [] };
}
function buildPlan(repo, base, branches) {
  gitOrThrow(repo, ["rev-parse", "--git-dir"]);
  verifyCommit(repo, base);
  for (const branch of branches)
    verifyCommit(repo, branch);
  const mergeTreeSupported = supportsMergeTree(repo);
  const plans = branches.map((branch) => {
    const log = gitOrThrow(repo, ["log", "--format=%H%x09%s", `${base}..${branch}`]);
    const commits = log.split(`
`).filter(Boolean).map((line) => {
      const tab = line.indexOf("\t");
      return { sha: line.slice(0, tab), subject: line.slice(tab + 1) };
    });
    const files = gitOrThrow(repo, ["diff", "--name-only", "-z", `${base}...${branch}`]).split("\x00").filter(Boolean).sort();
    const ancestor = git(repo, ["merge-base", "--is-ancestor", branch, base]);
    if (ancestor.status !== 0 && ancestor.status !== 1) {
      throw new PlanError(`git merge-base --is-ancestor failed for ${branch}: ${ancestor.stderr.trim()}`, EXIT_CANNOT_PLAN);
    }
    const alreadyMerged = ancestor.status === 0;
    const { prediction, conflictingFiles } = mergeTreeSupported ? predict(repo, base, branch) : { prediction: "unknown", conflictingFiles: [] };
    return { branch, commits, files, alreadyMerged, prediction, conflictingFiles };
  });
  const overlaps = [];
  for (let i = 0;i < plans.length; i++) {
    for (let j = i + 1;j < plans.length; j++) {
      const other = new Set(plans[j].files);
      const shared = plans[i].files.filter((file) => other.has(file));
      if (shared.length > 0)
        overlaps.push({ a: plans[i].branch, b: plans[j].branch, files: shared });
    }
  }
  return { base, branches: plans, overlaps, mergeTreeSupported };
}
function parsePlanArguments(args) {
  let base;
  let repo = process.cwd();
  const branches = [];
  for (let i = 0;i < args.length; i++) {
    const arg = args[i];
    if (arg === "--base" || arg === "--repo") {
      const value = args[++i];
      if (value === undefined || value.startsWith("-")) {
        throw new PlanError(`${arg} needs a value`, EXIT_USAGE);
      }
      if (arg === "--base")
        base = value;
      else
        repo = value;
    } else if (arg.startsWith("-")) {
      throw new PlanError(`Unknown option: ${arg}`, EXIT_USAGE);
    } else {
      branches.push(arg);
    }
  }
  if (!base)
    throw new PlanError("plan requires --base <ref>", EXIT_USAGE);
  if (branches.length === 0)
    throw new PlanError("plan requires at least one branch", EXIT_USAGE);
  return { base, repo, branches };
}
var USAGE = "Usage: integrate.mjs plan --base <ref> [--repo <dir>] <branch>...";
function main(argv) {
  try {
    const [subcommand, ...rest] = argv;
    if (subcommand !== "plan") {
      throw new PlanError(`${subcommand ? `Unknown subcommand: ${subcommand}. ` : ""}${USAGE}`, EXIT_USAGE);
    }
    const { base, repo, branches } = parsePlanArguments(rest);
    process.stdout.write(`${JSON.stringify(buildPlan(repo, base, branches), null, 2)}
`);
    return EXIT_OK;
  } catch (error) {
    if (error instanceof PlanError) {
      process.stderr.write(`integrate: ${error.message}
`);
      return error.exitCode;
    }
    process.stderr.write(`integrate: unexpected error: ${String(error)}
`);
    return 1;
  }
}
var entry = process.argv[1] ?? "";
if (/integrate\.(mjs|ts)$/.test(entry)) {
  process.exitCode = main(process.argv.slice(2));
}
export {
  EXIT_CANNOT_PLAN,
  EXIT_OK,
  EXIT_USAGE,
  buildPlan,
  main,
  parsePlanArguments
};
