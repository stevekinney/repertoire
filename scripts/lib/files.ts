import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every file under `directory`, recursively. Directories themselves are not included.
 *
 * Symbolic links are returned as entries and never followed, so a dangling link or a link to a
 * directory shows up as a single path instead of throwing or recursing.
 */
export function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

/** Files the build never copies and the linter never expects to be referenced. */
export const ignoredFileNames = new Set(['.DS_Store']);
