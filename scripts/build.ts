/**
 * Builds `src/skills/` into `skills/`.
 *
 * - `src/skills/<skill>/scripts/*.ts` (top level only) are entry points. Each one is
 *   bundled into a self-contained `skills/<skill>/scripts/<name>.mjs` for Node, with every
 *   npm dependency inlined, so the installed plugin needs no `node_modules`.
 * - Every other TypeScript file is library code. It ships only inside a bundle that imports it.
 * - Everything else (SKILL.md, references, templates, dotfiles) is copied verbatim.
 *
 * `skills/` is generated output: it is wiped and rebuilt on every run. The build lints
 * `src/skills/` first (see `scripts/lint.ts`) and refuses to build when anything fails.
 *
 * Usage:
 *   bun scripts/build.ts           Rebuild skills/
 *   bun scripts/build.ts --check   Exit 1 if skills/ is out of date with src/skills/
 */

import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { walk } from './lib/files';
import { formatFindings, lintSkills, shippedPath } from './lint';

const root = resolve(import.meta.dir, '..');
const sourceDirectory = join(root, 'src', 'skills');
const outputDirectory = join(root, 'skills');
const hookSourceDirectory = join(root, 'src', 'hooks');
const hookOutputDirectory = join(root, 'hooks', 'scripts');
const check = process.argv.includes('--check');

const shebang = '#!/usr/bin/env node';

async function build(destination: string): Promise<boolean> {
  const entryPoints: string[] = [];

  for (const file of walk(sourceDirectory)) {
    const [skill, ...rest] = relative(sourceDirectory, file).split(sep);

    // Files directly in src/skills/ (such as .gitkeep) belong to no skill and are copied as is.
    const shipped = rest.length === 0 ? skill! : shippedPath(rest.join(sep));
    if (shipped === undefined) continue;

    if (shipped.endsWith('.mjs') && !file.endsWith('.mjs')) {
      entryPoints.push(file);
    } else {
      const target = join(destination, relative(sourceDirectory, file));
      mkdirSync(dirname(target), { recursive: true });
      cpSync(file, target);
    }
  }

  return bundle(entryPoints, sourceDirectory, destination);
}

/** Bundle TypeScript entry points into self-contained Node `.mjs` files that keep their directory under `root`. */
async function bundle(entryPoints: string[], entryRoot: string, destination: string): Promise<boolean> {
  if (entryPoints.length === 0) return true;

  const result = await Bun.build({
    entrypoints: entryPoints,
    root: entryRoot,
    outdir: destination,
    target: 'node',
    format: 'esm',
    naming: '[dir]/[name].mjs',
    throw: false,
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    return false;
  }

  // Bun keeps a shebang from the source (e.g. `#!/usr/bin/env bun`), so replace whatever is
  // there with a Node one rather than using `banner`, which would stack a second shebang.
  for (const output of result.outputs) {
    const code = readFileSync(output.path, 'utf8').replace(/^#!.*\n(\/\/ @bun.*\n)?/, '');
    writeFileSync(output.path, `${shebang}\n${code}`);
    chmodSync(output.path, 0o755);
  }

  return true;
}

/** Hook scripts: every top-level `src/hooks/*.ts` except tests is an entry point (`src/hooks/lib/` is library code), built to `hooks/scripts/<name>.mjs`. */
async function buildHooks(destination: string): Promise<boolean> {
  if (!existsSync(hookSourceDirectory)) return true;
  const entryPoints = walk(hookSourceDirectory).filter((file) => dirname(file) === hookSourceDirectory && /\.m?ts$/.test(file) && !/\.(test|spec|d)\.m?ts$/.test(file));
  return bundle(entryPoints, hookSourceDirectory, destination);
}

function snapshot(directory: string): Map<string, string> {
  const files = new Map<string, string>();
  if (!existsSync(directory)) return files;

  for (const file of walk(directory)) {
    const executable = (statSync(file).mode & 0o111) !== 0;
    files.set(relative(directory, file), `${executable ? 'x' : '-'}${readFileSync(file, 'base64')}`);
  }

  return files;
}

// Refuse to build skills that fail the lint, so broken sources never reach skills/.
const lintFindings = lintSkills(sourceDirectory, root);
if (lintFindings.length > 0) {
  console.error(`Not building: src/skills/ has lint problems. Run \`bun run lint\` for details.\n\n${formatFindings(lintFindings)}`);
  process.exit(1);
}

const staging = mkdtempSync(join(tmpdir(), 'repertoire-build-'));

type Target = { label: string; staged: string; output: string; build: (destination: string) => Promise<boolean> };
const targets: Target[] = [
  { label: 'skills/', staged: join(staging, 'skills'), output: outputDirectory, build },
  { label: 'hooks/scripts/', staged: join(staging, 'hooks'), output: hookOutputDirectory, build: buildHooks },
];

// Set `process.exitCode` rather than calling `process.exit()` so the `finally` cleanup runs.
try {
  for (const target of targets) {
    if (!(await target.build(target.staged))) {
      process.exitCode = 1;
      break;
    }
    mkdirSync(target.staged, { recursive: true });
  }

  if (process.exitCode !== 1 && check) {
    let stale = false;
    for (const target of targets) {
      const expected = snapshot(target.staged);
      const actual = snapshot(target.output);
      const paths = [...new Set([...expected.keys(), ...actual.keys()])].sort();
      const changed = paths.filter((path) => expected.get(path) !== actual.get(path));
      if (changed.length === 0) continue;

      stale = true;
      console.error(`${target.label} is out of date with its source. Run \`bun run build\`.\n`);
      for (const path of changed) {
        const status = !actual.has(path) ? 'missing' : !expected.has(path) ? 'extra' : 'changed';
        console.error(`  ${status}: ${target.label}${path}`);
      }
    }
    if (stale) process.exitCode = 1;
    else console.log('skills/ and hooks/scripts/ are up to date.');
  } else if (process.exitCode !== 1) {
    for (const target of targets) {
      rmSync(target.output, { recursive: true, force: true });
      if (snapshot(target.staged).size > 0) cpSync(target.staged, target.output, { recursive: true });
    }
    console.log(`Built skills/ from src/skills/ and hooks/scripts/ from src/hooks/.`);
  }
} finally {
  rmSync(staging, { recursive: true, force: true });
}
