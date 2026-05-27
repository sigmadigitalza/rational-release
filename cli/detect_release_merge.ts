/**
 * @module
 *
 * Detect whether a given commit SHA is the merge commit of a
 * `release/v*` PR. The prepare-release workflow uses this as a
 * race-guard: when a release PR merges, both prepare-release and
 * cut-release fire on the same SHA, and without this guard prepare-
 * release races cut-release into a phantom next-release PR
 * regurgitating commits that were just shipped.
 *
 * The pure function takes a {@link GhRunner} so tests inject a stub.
 */

import { defaultGhRunner, type GhRunner } from "./gh.ts";

/** Inputs to {@link detectReleaseMerge}. */
export interface DetectOptions {
  /** Commit SHA to inspect — typically `GITHUB_SHA`. */
  sha: string;
  /** Repo as `owner/name` — typically `GITHUB_REPOSITORY`. */
  repo: string;
  /** Branch-name prefix that identifies a release PR. Default `release/v`. */
  prefix?: string;
  /** Number of `gh` retries on transient failure. Default 3. */
  retries?: number;
  /** Delay between retries in ms. Default 5000. */
  retryDelayMs?: number;
  /** Sleep injection for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** `gh` runner injection for tests. */
  ghRunner?: GhRunner;
}

/** Result of {@link detectReleaseMerge}. */
export interface DetectResult {
  /** First release/v* head ref matched, or `null` if none / gh failed. */
  headRef: string | null;
  /** Warnings to surface (retry notices, "guard inactive" on permanent fail). */
  warnings: string[];
}

const DEFAULT_PREFIX = "release/v";
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 5000;

const defaultSleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

/**
 * Look up merged PRs whose merge commit equals `sha`. Returns the first
 * head ref that starts with the prefix, or `null` if none match. On
 * persistent `gh` failure, returns `null` with a warning — callers
 * decide whether to fail or proceed (the workflow proceeds, treating
 * the missing guard as racy-but-correct-most-of-the-time).
 */
export async function detectReleaseMerge(
  opts: DetectOptions,
): Promise<DetectResult> {
  const prefix = opts.prefix ?? DEFAULT_PREFIX;
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const retryDelay = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const sleep = opts.sleep ?? defaultSleep;
  const gh = opts.ghRunner ?? defaultGhRunner;
  const warnings: string[] = [];

  const endpoint = `repos/${opts.repo}/commits/${opts.sha}/pulls`;
  const jq = ".[] | select(.merged_at != null) | .head.ref";

  for (let attempt = 1; attempt <= retries; attempt++) {
    const result = await gh(["api", endpoint, "--jq", jq]);
    if (result.ok) {
      for (const raw of result.stdout.split("\n")) {
        const ref = raw.trim();
        if (ref.startsWith(prefix)) return { headRef: ref, warnings };
      }
      return { headRef: null, warnings };
    }
    if (attempt < retries) {
      warnings.push(
        `gh api attempt ${attempt} failed, retrying in ${retryDelay}ms`,
      );
      await sleep(retryDelay);
    } else {
      warnings.push(
        `gh api ${endpoint} failed after ${retries} attempts — ` +
          "release-merge guard inactive, proceeding",
      );
    }
  }
  return { headRef: null, warnings };
}
