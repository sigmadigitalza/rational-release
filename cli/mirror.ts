/**
 * Mirror files between paths using `src:dst` pairs.
 *
 * Replaces a while-read bash loop that was duplicated in prepare-release
 * and cut-release. Splitting parsing from IO lets us cover the parse
 * edge cases (missing colon, empty halves, whitespace) as unit tests.
 */

import { copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface MirrorPair {
  src: string;
  dst: string;
}

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

export async function mirrorPairs(pairs: MirrorPair[]): Promise<void> {
  for (const { src, dst } of pairs) {
    await mkdir(dirname(dst), { recursive: true });
    await copyFile(src, dst);
  }
}
