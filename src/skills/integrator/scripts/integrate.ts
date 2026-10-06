import { spawnSync } from 'node:child_process';

/**
 * Read-only planning for a multi-branch integration.
 *
 *   integrate.mjs plan --base <ref> [--repo <dir>] <branch>...
 *
 * Exit codes: 0 plan printed, 2 bad usage, 3 cannot plan (not a repository, unknown ref).
 * One note on "never write": `git merge-tree --write-tree` stores unreferenced objects in the
 * object database. It never touches the index, the working tree, or any ref.
 */

export const EXIT_OK = 0;
export const EXIT_USAGE = 2;
export const EXIT_CANNOT_PLAN = 3;

export type Prediction = 'clean' | 'conflict' | 'unknown';

export interface BranchPlan {
  branch: string;
  commits: { sha: string; subject: string }[];
  files: string[];
  alreadyMerged: boolean;
  prediction: Prediction;
  conflictingFiles: string[];
}

export interface Plan {
  base: string;
  branches: BranchPlan[];
  overlaps: { a: string; b: string; files: string[] }[];
  mergeTreeSupported: boolean;
}

class PlanError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
  }
}

interface GitResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function git(repo: string, args: string[]): GitResult {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (result.error) {
    throw new PlanError(`Could not run git: ${result.error.message}`, EXIT_CANNOT_PLAN);
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function gitOrThrow(repo: string, args: string[]): string {
  const result = git(repo, args);
  if (result.status !== 0) {
    throw new PlanError(
      `git ${args.join(' ')} failed (exit ${result.status}): ${result.stderr.trim()}`,
      EXIT_CANNOT_PLAN,
    );
  }
  return result.stdout;
}

function supportsMergeTree(repo: string): boolean {
  const match = /(\d+)\.(\d+)/.exec(git(repo, ['version']).stdout);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 2 || (major === 2 && minor >= 38);
}

function verifyCommit(repo: string, ref: string): void {
  const result = git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  if (result.status !== 0) {
    throw new PlanError(`Not a commit or branch in this repository: ${ref}`, EXIT_CANNOT_PLAN);
  }
}

function predict(
  repo: string,
  base: string,
  branch: string,
): { prediction: Prediction; conflictingFiles: string[] } {
  const result = git(repo, [
    'merge-tree',
    '--write-tree',
    '--name-only',
    '--no-messages',
    base,
    branch,
  ]);
  if (result.status === 0) return { prediction: 'clean', conflictingFiles: [] };
  if (result.status === 1) {
    // First line is the tree id; conflicted paths follow until the first blank line.
    const lines = result.stdout.split('\n').slice(1);
    const end = lines.indexOf('');
    const files = (end === -1 ? lines : lines.slice(0, end)).filter(Boolean);
    return { prediction: 'conflict', conflictingFiles: [...new Set(files)].sort() };
  }
  return { prediction: 'unknown', conflictingFiles: [] };
}

export function buildPlan(repo: string, base: string, branches: string[]): Plan {
  gitOrThrow(repo, ['rev-parse', '--git-dir']);
  verifyCommit(repo, base);
  for (const branch of branches) verifyCommit(repo, branch);

  const mergeTreeSupported = supportsMergeTree(repo);
  const plans: BranchPlan[] = branches.map((branch) => {
    const log = gitOrThrow(repo, ['log', '--format=%H%x09%s', `${base}..${branch}`]);
    const commits = log
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const tab = line.indexOf('\t');
        return { sha: line.slice(0, tab), subject: line.slice(tab + 1) };
      });
    const files = gitOrThrow(repo, ['diff', '--name-only', '-z', `${base}...${branch}`])
      .split('\0')
      .filter(Boolean)
      .sort();
    const ancestor = git(repo, ['merge-base', '--is-ancestor', branch, base]);
    if (ancestor.status !== 0 && ancestor.status !== 1) {
      throw new PlanError(
        `git merge-base --is-ancestor failed for ${branch}: ${ancestor.stderr.trim()}`,
        EXIT_CANNOT_PLAN,
      );
    }
    const alreadyMerged = ancestor.status === 0;
    const { prediction, conflictingFiles } = mergeTreeSupported
      ? predict(repo, base, branch)
      : { prediction: 'unknown' as const, conflictingFiles: [] };
    return { branch, commits, files, alreadyMerged, prediction, conflictingFiles };
  });

  const overlaps: Plan['overlaps'] = [];
  for (let i = 0; i < plans.length; i++) {
    for (let j = i + 1; j < plans.length; j++) {
      const other = new Set(plans[j]!.files);
      const shared = plans[i]!.files.filter((file) => other.has(file));
      if (shared.length > 0) overlaps.push({ a: plans[i]!.branch, b: plans[j]!.branch, files: shared });
    }
  }
  return { base, branches: plans, overlaps, mergeTreeSupported };
}

interface ParsedPlanArguments {
  base: string;
  repo: string;
  branches: string[];
}

export function parsePlanArguments(args: string[]): ParsedPlanArguments {
  let base: string | undefined;
  let repo = process.cwd();
  const branches: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--base' || arg === '--repo') {
      const value = args[++i];
      if (value === undefined || value.startsWith('-')) {
        throw new PlanError(`${arg} needs a value`, EXIT_USAGE);
      }
      if (arg === '--base') base = value;
      else repo = value;
    } else if (arg.startsWith('-')) {
      throw new PlanError(`Unknown option: ${arg}`, EXIT_USAGE);
    } else {
      branches.push(arg);
    }
  }
  if (!base) throw new PlanError('plan requires --base <ref>', EXIT_USAGE);
  if (branches.length === 0) throw new PlanError('plan requires at least one branch', EXIT_USAGE);
  return { base, repo, branches };
}

const USAGE = 'Usage: integrate.mjs plan --base <ref> [--repo <dir>] <branch>...';

export function main(argv: string[]): number {
  try {
    const [subcommand, ...rest] = argv;
    if (subcommand !== 'plan') {
      throw new PlanError(`${subcommand ? `Unknown subcommand: ${subcommand}. ` : ''}${USAGE}`, EXIT_USAGE);
    }
    const { base, repo, branches } = parsePlanArguments(rest);
    process.stdout.write(`${JSON.stringify(buildPlan(repo, base, branches), null, 2)}\n`);
    return EXIT_OK;
  } catch (error) {
    if (error instanceof PlanError) {
      process.stderr.write(`integrate: ${error.message}\n`);
      return error.exitCode;
    }
    process.stderr.write(`integrate: unexpected error: ${String(error)}\n`);
    return 1;
  }
}

// Run only when executed directly, not when a test imports this file.
const entry = process.argv[1] ?? '';
if (/integrate\.(mjs|ts)$/.test(entry)) {
  process.exitCode = main(process.argv.slice(2));
}
