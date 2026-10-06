#!/usr/bin/env node
import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/skills/session-handoff/scripts/write-handoff.ts
import { randomBytes } from "node:crypto";
import { lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
var EXIT = { ok: 0, failure: 1, usage: 2, refusedInput: 3, refusedTarget: 4 };

class HandoffError extends Error {
  code;
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}
var ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;
function parseArgs(argv) {
  const values = {};
  for (let i = 0;i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!["--file", "--section", "--verified-at"].includes(flag ?? "")) {
      throw new HandoffError(`Unknown argument: ${flag}`, EXIT.usage);
    }
    if (value === undefined || value.startsWith("--")) {
      throw new HandoffError(`${flag} needs a value`, EXIT.usage);
    }
    values[flag] = value;
  }
  const file = values["--file"];
  const verifiedAt = values["--verified-at"];
  const section = values["--section"] ?? "handoff";
  if (!file)
    throw new HandoffError("--file <path> is required", EXIT.usage);
  if (!verifiedAt) {
    throw new HandoffError("--verified-at <ISO time> is required (the script never reads the clock)", EXIT.usage);
  }
  if (!ISO.test(verifiedAt) || Number.isNaN(Date.parse(verifiedAt))) {
    throw new HandoffError(`--verified-at is not an ISO date or time: ${verifiedAt}`, EXIT.usage);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(section)) {
    throw new HandoffError(`--section must be letters, digits, '-' or '_': ${section}`, EXIT.usage);
  }
  return { file, section, verifiedAt };
}
function entryOf(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === "ENOENT")
      return;
    throw error;
  }
}
function buildSection(body, section, verifiedAt) {
  const start = `<!-- ${section}:start -->`;
  const end = `<!-- ${section}:end -->`;
  let inner = body;
  const s = inner.indexOf(start);
  const e = inner.lastIndexOf(end);
  if (s !== -1 && e > s)
    inner = inner.slice(s + start.length, e);
  inner = inner.split(start).join("").split(end).join("").trim();
  if (!inner)
    throw new HandoffError("Input is empty after removing markers", EXIT.refusedInput);
  return `${start}
<!-- ${section}:verified-at ${verifiedAt} -->

${inner}

${end}`;
}
function merge(existing, block, section) {
  if (existing === undefined)
    return { text: `${block}
`, action: "created" };
  const start = `<!-- ${section}:start -->`;
  const end = `<!-- ${section}:end -->`;
  const starts = existing.split(start).length - 1;
  const ends = existing.split(end).length - 1;
  if (starts === 0 && ends === 0) {
    const base = existing.replace(/\s+$/, "");
    return { text: base ? `${base}

${block}
` : `${block}
`, action: "appended" };
  }
  const s = existing.indexOf(start);
  const e = existing.indexOf(end);
  if (starts !== 1 || ends !== 1 || e < s) {
    throw new HandoffError(`Existing ${section} markers are malformed (${starts} start, ${ends} end, or out of order). Fix the file by hand; nothing was written.`, EXIT.refusedTarget);
  }
  return {
    text: existing.slice(0, s) + block + existing.slice(e + end.length),
    action: "replaced"
  };
}
function writeHandoff(options, body) {
  if (!body.trim())
    throw new HandoffError("Refusing empty input on stdin", EXIT.refusedInput);
  const stat = entryOf(options.file);
  if (stat?.isSymbolicLink()) {
    throw new HandoffError(`Refusing to write through a symlink: ${options.file}`, EXIT.refusedTarget);
  }
  if (stat && !stat.isFile()) {
    throw new HandoffError(`Not a regular file: ${options.file}`, EXIT.refusedTarget);
  }
  const existing = stat ? readFileSync(options.file, "utf8") : undefined;
  const block = buildSection(body, options.section, options.verifiedAt);
  const { text, action } = merge(existing, block, options.section);
  const directory = dirname(options.file);
  mkdirSync(directory, { recursive: true });
  const temporary = join(directory, `.${basename(options.file)}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    writeFileSync(temporary, text, { flag: "wx", mode: stat ? Number(stat.mode) & 511 : 420 });
    renameSync(temporary, options.file);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {}
    throw error;
  }
  return { path: options.file, action };
}
function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const body = readFileSync(0, "utf8");
    process.stdout.write(`${JSON.stringify(writeHandoff(options, body))}
`);
    return EXIT.ok;
  } catch (error) {
    if (error instanceof HandoffError) {
      process.stderr.write(`write-handoff: ${error.message}
`);
      return error.code;
    }
    process.stderr.write(`write-handoff: ${error.message}
`);
    return EXIT.failure;
  }
}
if (__require.main == __require.module !== false && /write-handoff\.(ts|mjs)$/.test(process.argv[1] ?? "")) {
  process.exitCode = main();
}
export {
  EXIT,
  HandoffError,
  buildSection,
  merge,
  parseArgs,
  writeHandoff
};
