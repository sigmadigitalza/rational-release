/**
 * @module
 *
 * Look up the most recent strict-semver release tag (`vX.Y.Z`). Used
 * by prepare-release to anchor commit/PR collection ranges.
 *
 * Filters out non-strict tags (`v1`, `v0.1.0-rc1`, etc) so a floating
 * major-version tag — which release-engineering repos like this one
 * force-update on every cut — doesn't get returned as "the previous
 * release."
 */

import { defaultGitRunner, type GitRunner } from "./git.ts";

const STRICT_SEMVER = /^v\d+\.\d+\.\d+$/;

/** Inputs to {@link prevTag}. */
export interface PrevTagOptions {
  /** `git` runner injection for tests. */
  gitRunner?: GitRunner;
}

/** Result of {@link prevTag}. */
export interface PrevTagResult {
  /** Most recent strict-semver tag, or `null` if none. */
  tag: string | null;
}

/**
 * Filter a list of tag names to strict-semver `vX.Y.Z` only. Pure
 * function — testable without subprocess.
 */
export function pickStrictSemverTags(tags: readonly string[]): string[] {
  return tags.filter((t) => STRICT_SEMVER.test(t));
}

/**
 * Return the most recent `vX.Y.Z` tag, or `null` if the repo has no
 * release tags yet. Sorted by `-v:refname` so the highest semver wins
 * regardless of creation order.
 */
export async function prevTag(
  opts: PrevTagOptions = {},
): Promise<PrevTagResult> {
  const git = opts.gitRunner ?? defaultGitRunner;
  const result = await git(["tag", "--list", "v*", "--sort=-v:refname"]);
  if (!result.ok) {
    throw new Error(`git tag failed: ${result.stderr.trim()}`);
  }
  const all = result.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  const strict = pickStrictSemverTags(all);
  return { tag: strict[0] ?? null };
}
