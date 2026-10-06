#!/usr/bin/env node
// src/skills/sentinels/scripts/sentinel.ts
import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeSync
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
var SCHEMA_VERSION = 1;
var STATUSES = ["passed", "failed", "blocked", "aborted"];
var DEFAULT_MAX_BYTES = 65536;
var KEY_PATTERN = /^[0-9a-f]{64}$/;
var EVIDENCE_KEY_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
function isStatus(value) {
  return STATUSES.includes(value);
}
function isKey(value) {
  return KEY_PATTERN.test(value);
}
function markerPath(dir, key) {
  if (!isKey(key))
    throw new Error(`key must be 64 lowercase hex characters (from \`sentinel key\`), got ${JSON.stringify(key)}`);
  return join(resolve(dir), `${key}.json`);
}
function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}
function computeKey({ version, inputs = [], fileDigests = [], stdin }) {
  if (version.length === 0)
    throw new Error("--version must not be empty");
  const hash = createHash("sha256");
  hash.update(`sentinel-key/1
`);
  hash.update(`version:${Buffer.byteLength(version)}:${version}
`);
  for (const input of [...inputs].sort())
    hash.update(`input:${Buffer.byteLength(input)}:${input}
`);
  for (const digest of [...fileDigests].sort())
    hash.update(`file:${digest}
`);
  if (stdin !== undefined)
    hash.update(`stdin:${sha256(stdin)}
`);
  return hash.digest("hex");
}
function digestFile(path) {
  return sha256(readFileSync(path));
}
function errorCode(error) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function writeMarker({ dir, key, status, claim = false, evidence = {}, now }) {
  const path = markerPath(dir, key);
  const directory = resolve(dir);
  const temp = join(directory, `.tmp-${key.slice(0, 16)}-${process.pid}-${randomBytes(6).toString("hex")}`);
  const payload = {
    schema: SCHEMA_VERSION,
    key,
    status,
    writtenAt: (now ?? (() => new Date().toISOString()))(),
    evidence
  };
  let fd;
  try {
    fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 420);
    writeSync(fd, `${JSON.stringify(payload, null, 2)}
`);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
  } catch (error) {
    if (fd !== undefined)
      closeSync(fd);
    removeQuietly(temp);
    const hint = errorCode(error) === "ENOENT" ? ` (does ${directory} exist?)` : "";
    return { ok: false, reason: "write-failed", path, message: `${errorMessage(error)}${hint}` };
  }
  try {
    if (claim) {
      linkSync(temp, path);
    } else {
      renameSync(temp, path);
    }
  } catch (error) {
    removeQuietly(temp);
    if (claim && errorCode(error) === "EEXIST") {
      return { ok: false, reason: "claim-exists", path, message: "a marker for this key already exists; the claim was not taken" };
    }
    return { ok: false, reason: "write-failed", path, message: errorMessage(error) };
  }
  if (claim)
    removeQuietly(temp);
  return { ok: true, path };
}
function removeQuietly(path) {
  try {
    unlinkSync(path);
  } catch {}
}
function invalid(reason) {
  const exitCode = reason === "wrong-status" ? 2 : reason === "wrong-key" ? 3 : 1;
  return { result: "invalid", reason, exitCode };
}
function checkMarker({ dir, key, expect, maxBytes = DEFAULT_MAX_BYTES }) {
  const path = markerPath(dir, key);
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink())
      return invalid("symlink");
    if (!stat.isFile())
      return invalid("not-a-file");
  } catch (error) {
    return invalid(errorCode(error) === "ENOENT" ? "missing" : "unreadable");
  }
  let fd;
  let text;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile())
      return invalid("not-a-file");
    if (stat.size > maxBytes)
      return invalid("too-large");
    const buffer = Buffer.alloc(maxBytes + 1);
    const read = readSync(fd, buffer, 0, buffer.length, 0);
    if (read > maxBytes)
      return invalid("too-large");
    text = buffer.subarray(0, read).toString("utf8");
  } catch (error) {
    return invalid(errorCode(error) === "ELOOP" ? "symlink" : "unreadable");
  } finally {
    if (fd !== undefined)
      closeSync(fd);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return invalid("unparseable");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return invalid("bad-schema");
  const record = parsed;
  if (record.schema !== SCHEMA_VERSION)
    return invalid("bad-schema");
  if (typeof record.status !== "string" || !isStatus(record.status))
    return invalid("bad-status");
  if (record.key !== key)
    return invalid("wrong-key");
  if (record.status !== expect)
    return invalid("wrong-status");
  return { result: "valid", status: expect, exitCode: 0 };
}
var USAGE = `usage:
  sentinel key   --version <v> [--input <s>]... [--file <path>]... [--stdin]
  sentinel write --dir <dir> --key <key> --status passed|failed|blocked|aborted [--claim] [--evidence k=v]...
  sentinel check --dir <dir> --key <key> --expect passed|failed|blocked|aborted [--max-bytes <n>]`;

class UsageError extends Error {
}
function readStdin() {
  const chunks = [];
  const buffer = Buffer.alloc(65536);
  for (;; ) {
    let read;
    try {
      read = readSync(0, buffer, 0, buffer.length, null);
    } catch (error) {
      if (errorCode(error) === "EAGAIN")
        continue;
      if (errorCode(error) === "EOF")
        break;
      throw error;
    }
    if (read === 0)
      break;
    chunks.push(Buffer.from(buffer.subarray(0, read)));
  }
  return Buffer.concat(chunks);
}
function parse(config) {
  try {
    return parseArgs(config);
  } catch (error) {
    throw new UsageError(errorMessage(error));
  }
}
function requireString(values, name) {
  const value = values[name];
  if (typeof value !== "string" || value.length === 0)
    throw new UsageError(`--${name} is required`);
  return value;
}
function requireStatus(values, name) {
  const value = requireString(values, name);
  if (!isStatus(value))
    throw new UsageError(`--${name} must be one of ${STATUSES.join(", ")}`);
  return value;
}
function strings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function runKey(args) {
  const { values } = parse({
    args,
    options: {
      version: { type: "string" },
      input: { type: "string", multiple: true },
      file: { type: "string", multiple: true },
      stdin: { type: "boolean" }
    },
    strict: true,
    allowPositionals: false
  });
  const version = requireString(values, "version");
  const fileDigests = [];
  for (const file of strings(values.file)) {
    try {
      fileDigests.push(digestFile(file));
    } catch (error) {
      console.error(`sentinel key: cannot read --file ${file}: ${errorMessage(error)}`);
      return 2;
    }
  }
  const key = computeKey({
    version,
    inputs: strings(values.input),
    fileDigests,
    stdin: values.stdin ? readStdin() : undefined
  });
  process.stdout.write(`${key}
`);
  return 0;
}
function runWrite(args) {
  const { values } = parse({
    args,
    options: {
      dir: { type: "string" },
      key: { type: "string" },
      status: { type: "string" },
      claim: { type: "boolean" },
      evidence: { type: "string", multiple: true }
    },
    strict: true,
    allowPositionals: false
  });
  const dir = requireString(values, "dir");
  const key = requireString(values, "key");
  if (!isKey(key))
    throw new UsageError("--key must be 64 lowercase hex characters, as printed by `sentinel key`");
  const status = requireStatus(values, "status");
  const evidence = {};
  for (const pair of strings(values.evidence)) {
    const separator = pair.indexOf("=");
    const name = separator === -1 ? "" : pair.slice(0, separator);
    if (!EVIDENCE_KEY_PATTERN.test(name))
      throw new UsageError(`--evidence expects name=value with a name matching ${EVIDENCE_KEY_PATTERN}, got ${JSON.stringify(pair)}`);
    evidence[name] = pair.slice(separator + 1);
  }
  const result = writeMarker({ dir, key, status, claim: values.claim === true, evidence });
  if (result.ok) {
    process.stdout.write(`${JSON.stringify({ result: "written", path: result.path, status, claimed: values.claim === true })}
`);
    return 0;
  }
  process.stdout.write(`${JSON.stringify({ result: result.reason, path: result.path })}
`);
  console.error(`sentinel write: ${result.message}`);
  return result.reason === "claim-exists" ? 1 : 2;
}
function runCheck(args) {
  const { values } = parse({
    args,
    options: {
      dir: { type: "string" },
      key: { type: "string" },
      expect: { type: "string" },
      "max-bytes": { type: "string" }
    },
    strict: true,
    allowPositionals: false
  });
  const dir = requireString(values, "dir");
  const key = requireString(values, "key");
  if (!isKey(key))
    throw new UsageError("--key must be 64 lowercase hex characters, as printed by `sentinel key`");
  const expect = requireStatus(values, "expect");
  let maxBytes = DEFAULT_MAX_BYTES;
  if (typeof values["max-bytes"] === "string") {
    maxBytes = Number(values["max-bytes"]);
    if (!Number.isInteger(maxBytes) || maxBytes <= 0)
      throw new UsageError("--max-bytes must be a positive integer");
  }
  const result = checkMarker({ dir, key, expect, maxBytes });
  if (result.result === "valid") {
    process.stdout.write(`${JSON.stringify({ result: "valid", status: expect })}
`);
  } else {
    process.stdout.write(`${JSON.stringify({ result: "invalid", reason: result.reason })}
`);
  }
  return result.exitCode;
}
function main(argv) {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case "key":
        return runKey(rest);
      case "write":
        return runWrite(rest);
      case "check":
        return runCheck(rest);
      default:
        throw new UsageError(command === undefined ? "a subcommand is required" : `unknown subcommand ${JSON.stringify(command)}`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`sentinel: ${error.message}
${USAGE}`);
      return 64;
    }
    console.error(`sentinel: ${errorMessage(error)}`);
    return 2;
  }
}
function isEntryPoint() {
  const entry = process.argv[1];
  if (entry === undefined)
    return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isEntryPoint())
  process.exitCode = main(process.argv.slice(2));
export {
  DEFAULT_MAX_BYTES,
  SCHEMA_VERSION,
  STATUSES,
  checkMarker,
  computeKey,
  digestFile,
  isKey,
  isStatus,
  main,
  markerPath,
  writeMarker
};
