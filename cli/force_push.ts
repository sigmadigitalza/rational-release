/**
 * @module
 *
 * Force-push HEAD to a remote ref with retry. Used by prepare-release
 * to publish the prep commit to the `release/vX.Y.Z` branch on each
 * run, and (in cut-release) to fast-forward the floating major-version
 * tag onto a new patch/minor release.
 */

import { defaultGitRunner, type GitRunner } from "./git.ts";

/** Inputs to {@link forcePush}. */
export interface ForcePushOptions {
  /** Remote name. Default `origin`. */
  remote?: string;
  /** Refspec — e.g. `HEAD:refs/heads/release/v1.7.0` or `v1`. */
  refspec: string;
  /** Number of retries on transient failure. Default 3. */
  retries?: number;
  /** Delay between retries in ms. Default 5000. */
  retryDelayMs?: number;
  /** `git` runner injection for tests. */
  gitRunner?: GitRunner;
  /** Sleep injection for tests. */
  sleep?: (ms: number) => Promise<void>;
}

/** Result of {@link forcePush}. */
export interface ForcePushResult {
  /** Warnings (retry notices). */
  warnings: string[];
}

const DEFAULT_REMOTE = "origin";
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 5000;

const defaultSleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

/**
 * `git push --force <remote> <refspec>` with retry on transient
 * failure. Throws if all attempts fail. Retry warnings are returned
 * so the CLI driver can surface them.
 */
export async function forcePush(
  opts: ForcePushOptions,
): Promise<ForcePushResult> {
  const remote = opts.remote ?? DEFAULT_REMOTE;
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const retryDelay = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const git = opts.gitRunner ?? defaultGitRunner;
  const sleep = opts.sleep ?? defaultSleep;
  const warnings: string[] = [];

  for (let attempt = 1; attempt <= retries; attempt++) {
    const result = await git(["push", "--force", remote, opts.refspec]);
    if (result.ok) return { warnings };
    if (attempt < retries) {
      warnings.push(
        `git push attempt ${attempt} failed, retrying in ${retryDelay}ms: ${result.stderr.trim()}`,
      );
      await sleep(retryDelay);
    }
  }
  throw new Error(`git push failed after ${retries} attempts`);
}
