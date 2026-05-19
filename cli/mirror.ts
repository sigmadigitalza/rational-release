/**
 * @module
 *
 * Mirror files between paths using `src:dst` pairs.
 *
 * Replaces a while-read bash loop that was duplicated in prepare-release
 * and cut-release. Splitting parsing from IO lets us cover the parse
 * edge cases (missing colon, empty halves, whitespace) as unit tests.
 */

import { copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/** A single `src` → `dst` mirror instruction. */
export interface MirrorPair {
  src: string;
  dst: string;
}

/**
 * Parse newline-separated `src:dst` lines into pairs.
 *
 * Blank lines are skipped. Surrounding whitespace is tolerated. Only the
 * first colon splits — destinations may contain further colons. Throws
 * with the offending line number on missing colon or empty halves.
 */
export function parsePairs(text: string): MirrorPair[] {
  const pairs: MirrorPair[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) {
      throw new Error(
        `mirror: line ${i + 1} is not a "src:dst" pair: ${line}`,
      );
    }
    const src = line.slice(0, idx).trim();
    const dst = line.slice(idx + 1).trim();
    if (!src || !dst) {
      throw new Error(
        `mirror: line ${i + 1} has empty src or dst: ${line}`,
      );
    }
    pairs.push({ src, dst });
  }
  return pairs;
}

/**
 * Copy each `src` to its `dst`, creating destination parent directories
 * recursively as needed.
 */
export async function mirrorPairs(pairs: MirrorPair[]): Promise<void> {
  for (const { src, dst } of pairs) {
    await mkdir(dirname(dst), { recursive: true });
    await copyFile(src, dst);
  }
}
