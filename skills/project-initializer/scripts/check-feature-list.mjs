#!/usr/bin/env node
// src/skills/project-initializer/scripts/lib/feature-list.ts
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
var usage = `Usage:
  check-feature-list <path> [--initial]
  check-feature-list diff <old> <new>

Exit codes: 0 valid, 1 invalid or ratchet violated, 2 unreadable file or bad usage.`;

class ReadError extends Error {
}
function load(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new ReadError(`Cannot read ${path}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new SyntaxError(`${path} is not valid JSON: ${error.message}`);
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function extractEntries(data) {
  if (Array.isArray(data))
    return { entries: data, errors: [] };
  if (isRecord(data) && Array.isArray(data.features))
    return { entries: data.features, errors: [] };
  return {
    entries: null,
    errors: ['Top level must be an array of entries or an object with a "features" array.']
  };
}
function validateFeatureList(data, initial) {
  const { entries, errors } = extractEntries(data);
  if (!entries)
    return { valid: false, errors };
  entries.forEach((entry, index) => {
    const label = `Entry ${index}`;
    if (!isRecord(entry)) {
      errors.push(`${label}: must be an object.`);
      return;
    }
    for (const field of ["id", "description"]) {
      const value = entry[field];
      if (typeof value !== "string" || value.trim() === "") {
        errors.push(`${label}: "${field}" must be a non-empty string.`);
      }
    }
    if (!Array.isArray(entry.steps))
      errors.push(`${label}: "steps" must be an array.`);
    if (typeof entry.passes !== "boolean") {
      errors.push(`${label}: "passes" must be a boolean (true or false), not ${typeof entry.passes}.`);
    } else if (initial && entry.passes !== false) {
      errors.push(`${label}: "passes" must be false in an initial list.`);
    }
  });
  return { valid: errors.length === 0, errors };
}
function diffFeatureLists(oldData, newData) {
  const oldParsed = extractEntries(oldData);
  const newParsed = extractEntries(newData);
  const errors = [
    ...oldParsed.errors.map((message) => `old: ${message}`),
    ...newParsed.errors.map((message) => `new: ${message}`)
  ];
  if (!oldParsed.entries || !newParsed.entries)
    return { valid: false, errors };
  const before = oldParsed.entries;
  const after = newParsed.entries;
  if (after.length < before.length) {
    errors.push(`Entries removed: ${before.length} before, ${after.length} after.`);
  }
  if (after.length > before.length) {
    errors.push(`Entries added: ${before.length} before, ${after.length} after.`);
  }
  for (let index = 0;index < Math.min(before.length, after.length); index++) {
    const a = before[index];
    const b = after[index];
    if (!isRecord(a) || !isRecord(b)) {
      if (!isDeepStrictEqual(a, b))
        errors.push(`Entry ${index}: changed.`);
      continue;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    keys.delete("passes");
    for (const key of [...keys].sort()) {
      if (!isDeepStrictEqual(a[key], b[key])) {
        errors.push(`Entry ${index}: "${key}" changed. Only "passes" may change.`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
function emit(result) {
  process.stdout.write(`${JSON.stringify(result)}
`);
  for (const message of result.errors)
    process.stderr.write(`${message}
`);
  return result.valid ? 0 : 1;
}
function run(argv) {
  try {
    if (argv[0] === "diff") {
      if (argv.length !== 3)
        throw new ReadError(usage);
      return emit(diffFeatureLists(load(argv[1]), load(argv[2])));
    }
    const initial = argv.includes("--initial");
    const paths = argv.filter((argument) => argument !== "--initial");
    if (paths.length !== 1)
      throw new ReadError(usage);
    return emit(validateFeatureList(load(paths[0]), initial));
  } catch (error) {
    if (error instanceof ReadError) {
      process.stderr.write(`${error.message}
`);
      return 2;
    }
    if (error instanceof SyntaxError) {
      return emit({ valid: false, errors: [error.message] });
    }
    throw error;
  }
}

// src/skills/project-initializer/scripts/check-feature-list.ts
process.exitCode = run(process.argv.slice(2));
