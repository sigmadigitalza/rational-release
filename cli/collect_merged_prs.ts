/**
 * @module
 *
 * Collect merged PRs targeting the default branch since a timestamp,
 * for the changelog generator to bucket. Wraps `gh pr list --json` +
 * a `mergedAt > since` filter, with retry on transient gh failures.
 */

import { writeFile } from "node:fs/promises";
import { defaultGhRunner, type GhRunner } from "./gh.ts";
import { defaultGitRunner, type GitRunner } from "./git.ts";

/** Inputs to {@link collectMergedPrs}. */
export interface CollectMergedPrsOptions {
  /** Base branch the PRs were merged into. Default `main`. */
  base?: string;
  /** Unix epoch seconds — only PRs merged AFTER this are included. */
  sinceEpoch: number;
  /** Output JSON file path. */
  outFile: string;
  /** Max PRs to fetch. Default 200. */
  limit?: number;
  /** Number of `gh` retries on transient failure. Default 3. */
  retries?: number;
  /** Delay between retries in ms. Default 5000. */
  retryDelayMs?: number;
  /** `gh` runner injection for tests. */
  ghRunner?: GhRunner;
  /** Sleep injection for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** File-writer injection for tests. */
  writer?: (path: string, content: string) => Promise<void>;
}

/**
 * Resolve a previous-release tag to a Unix epoch (the tagged commit's
 * committer time). Empty / null tag returns 0 (first release — include
 * every merged PR). Throws if `git log` fails on a non-empty tag.
 */
export async function resolveSinceEpoch(
  prevTag: string | null | undefined,
  gitRunner: GitRunner = defaultGitRunner,
): Promise<number> {
  if (!prevTag) return 0;
  const result = await gitRunner(["log", "-1", "--format=%ct", prevTag]);
  if (!result.ok) {
    throw new Error(
      `git log for tag ${prevTag} failed: ${result.stderr.trim()}`,
    );
  }
  const epoch = Number(result.stdout.trim());
  if (!Number.isFinite(epoch)) {
    throw new Error(
      `git log returned non-numeric epoch for tag ${prevTag}: ${result.stdout.trim()}`,
    );
  }
  return epoch;
}

/** One merged PR row from `gh pr list --json`. */
export interface MergedPrRow {
  number: number;
  title: string;
  mergedAt: string;
  author?: { login?: string; is_bot?: boolean };
}

/** Result of {@link collectMergedPrs}. */
export interface CollectMergedPrsResult {
  /** Count of PRs that passed the since-filter. */
  count: number;
  /** Warnings (retry notices). */
  warnings: string[];
}

const DEFAULT_BASE = "main";
const DEFAULT_LIMIT = 200;
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 5000;

const defaultSleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

const defaultWriter = (path: string, content: string) =>
  writeFile(path, content);

/**
 * Filter PRs by `mergedAt > sinceEpoch`. Pure function — testable
 * without subprocess.
 */
export function filterSince(
  prs: readonly MergedPrRow[],
  sinceEpoch: number,
): MergedPrRow[] {
  return prs.filter((p) => {
    if (!p.mergedAt) return false;
    const epoch = Math.floor(new Date(p.mergedAt).getTime() / 1000);
    return epoch > sinceEpoch;
  });
}

/**
 * Fetch merged PRs via `gh pr list --json`, filter by `mergedAt >
 * sinceEpoch`, write the filtered array to `outFile` as JSON.
 * Retries transient `gh` failures up to `retries` times.
 */
export async function collectMergedPrs(
  opts: CollectMergedPrsOptions,
): Promise<CollectMergedPrsResult> {
  const base = opts.base ?? DEFAULT_BASE;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const retryDelay = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const gh = opts.ghRunner ?? defaultGhRunner;
  const sleep = opts.sleep ?? defaultSleep;
  const write = opts.writer ?? defaultWriter;
  const warnings: string[] = [];

  const args = [
    "pr",
    "list",
    "--base",
    base,
    "--state",
    "merged",
    "--limit",
    String(limit),
    "--json",
    "number,title,mergedAt,author",
  ];

  for (let attempt = 1; attempt <= retries; attempt++) {
    const result = await gh(args);
    if (result.ok) {
      const all: MergedPrRow[] = JSON.parse(result.stdout.trim() || "[]");
      const filtered = filterSince(all, opts.sinceEpoch);
      await write(opts.outFile, JSON.stringify(filtered));
      return { count: filtered.length, warnings };
    }
    if (attempt < retries) {
      warnings.push(
        `gh pr list attempt ${attempt} failed, retrying in ${retryDelay}ms`,
      );
      await sleep(retryDelay);
    }
  }
  throw new Error(`gh pr list failed after ${retries} attempts`);
}
