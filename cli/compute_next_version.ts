/**
 * @module
 *
 * Read the current manifest version, compute the next semver from
 * commit subjects, and report both plus a `bumped` flag. Single-shot
 * helper used by the prepare-release workflow — saves wiring `read-
 * version` + `next-version` together in shell.
 */

import { readFile } from "node:fs/promises";
import { highestBump } from "./conventional.ts";
import { nextVersion } from "./version.ts";
import { readManifestVersion } from "./manifest.ts";

/** Inputs to {@link computeNextVersion}. */
export interface ComputeNextOptions {
  manifestPath: string;
  jsonPath?: string;
  commitsFile: string;
  pre1Cap?: boolean;
  patchTypes?: string[];
  minorTypes?: string[];
}

/** Result of {@link computeNextVersion}. */
export interface ComputeNextResult {
  current: string;
  next: string;
  bumped: boolean;
}

/**
 * Read manifest version + commit subjects, return current/next/bumped.
 * The commits file is the output of `cli collect-commits` — one
 * subject per line. Empty lines are ignored.
 *
 * Throws on read failures (manifest, commits file) so the caller can
 * surface an actionable error to the workflow log.
 */
export async function computeNextVersion(
  opts: ComputeNextOptions,
): Promise<ComputeNextResult> {
  const current = await readManifestVersion(
    opts.manifestPath,
    opts.jsonPath ?? "$.version",
  );
  if (current === "") {
    throw new Error(
      `Manifest version at ${opts.manifestPath} (${
        opts.jsonPath ?? "$.version"
      }) is empty`,
    );
  }
  const text = await readFile(opts.commitsFile, "utf-8");
  const subjects = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const bump = highestBump(subjects, {
    patchTypes: opts.patchTypes,
    minorTypes: opts.minorTypes,
  });
  const next = nextVersion(current, bump, { pre1Cap: opts.pre1Cap });
  return { current, next, bumped: current !== next };
}
