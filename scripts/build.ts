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

  if (entryPoints.length === 0) return true;

  const result = await Bun.build({
    entrypoints: entryPoints,
    root: sourceDirectory,
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

// Set `process.exitCode` rather than calling `process.exit()` so the `finally` cleanup runs.
try {
  if (!(await build(staging))) {
    process.exitCode = 1;
  } else if (check) {
    const expected = snapshot(staging);
    const actual = snapshot(outputDirectory);
    const paths = [...new Set([...expected.keys(), ...actual.keys()])].sort();
    const stale = paths.filter((path) => expected.get(path) !== actual.get(path));

    if (stale.length > 0) {
      console.error('skills/ is out of date with src/skills/. Run `bun run build`.\n');
      for (const path of stale) {
        const status = !actual.has(path) ? 'missing' : !expected.has(path) ? 'extra' : 'changed';
        console.error(`  ${status}: skills/${path}`);
      }
      process.exitCode = 1;
    } else {
      console.log('skills/ is up to date.');
    }
  } else {
    rmSync(outputDirectory, { recursive: true, force: true });
    cpSync(staging, outputDirectory, { recursive: true });
    console.log(`Built ${relative(root, outputDirectory)}/ from ${relative(root, sourceDirectory)}/.`);
  }
} finally {
  rmSync(staging, { recursive: true, force: true });
}
