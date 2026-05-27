/**
 * @module
 *
 * Collect commit subjects in a range (`<prev-tag>..HEAD`, or the
 * whole history on first release). Written to a file for the
 * downstream `next-version` and changelog-generation steps to read.
 */

import { writeFile } from "node:fs/promises";
import { defaultGitRunner, type GitRunner } from "./git.ts";

/** Inputs to {@link collectCommits}. */
export interface CollectCommitsOptions {
  /** Previous release tag (empty / null on first release). */
  prevTag?: string | null;
  /** Output path for newline-separated subjects. */
  outFile: string;
  /** `git` runner injection for tests. */
  gitRunner?: GitRunner;
  /** File-writer injection for tests. */
  writer?: (path: string, content: string) => Promise<void>;
}

/** Result of {@link collectCommits}. */
export interface CollectCommitsResult {
  /** Number of subject lines written. */
  count: number;
  /** The range used (e.g. `v1.6.1..HEAD` or `` for first release). */
  range: string;
}

const defaultWriter = (path: string, content: string) =>
  writeFile(path, content);

/**
 * Run `git log [<range>] --format=%s` and write the output to
 * `outFile`. Returns `{count, range}`. Range is empty (== whole
 * history) when `prevTag` is absent or empty.
 */
export async function collectCommits(
  opts: CollectCommitsOptions,
): Promise<CollectCommitsResult> {
  const git = opts.gitRunner ?? defaultGitRunner;
  const write = opts.writer ?? defaultWriter;
  const range = opts.prevTag ? `${opts.prevTag}..HEAD` : "";
  const args = range ? ["log", range, "--format=%s"] : ["log", "--format=%s"];
  const result = await git(args);
  if (!result.ok) {
    throw new Error(`git log failed: ${result.stderr.trim()}`);
  }
  await write(opts.outFile, result.stdout);
  const count = result.stdout
    ? result.stdout.split("\n").filter((l) => l.length > 0).length
    : 0;
  return { count, range };
}
