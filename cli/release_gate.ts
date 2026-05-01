/**
 * Decide whether prepare-release should open/update a release PR.
 *
 * Three signals feed in:
 *   - prevTag:  the most recent v* tag (empty string if none yet)
 *   - current:  the version currently in the manifest (X.Y.Z)
 *   - bumped:   whether the conventional-commit walk produced a higher version
 *
 * Returns a verdict the workflow turns into a step output. Splitting the
 * decision out lets us cover the edge cases as unit tests rather than
 * trusting a few `sort -V` lines under bash.
 */

import { parseVersion } from "./version.ts";

export interface GateVerdict {
  proceed: boolean;
  reason: string;
}

function compareSemver(a: string, b: string): number {
  const [aMaj, aMin, aPatch] = parseVersion(a);
  const [bMaj, bMin, bPatch] = parseVersion(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPatch - bPatch;
}

function stripV(tag: string): string {
  return tag.startsWith("v") ? tag.slice(1) : tag;
}

export function releaseGate(
  prevTag: string,
  current: string,
  bumped: boolean,
): GateVerdict {
  // First release: no prior tag, always proceed so the initial PR can open
  // even when the conventional-commit walk produces no bump (e.g. seed repo
  // already at a non-zero version).
  if (!prevTag) {
    return { proceed: true, reason: "no previous release tag" };
  }

  const prevVersion = stripV(prevTag);

  // If the manifest is already ahead of the previous tag, a release is in
  // flight: a release PR was merged (manifest bumped, finalisation commit
  // landed) but cut-release hasn't tagged yet, or someone bumped manually.
  // Opening another release PR on top would race the cut.
  if (current !== prevVersion && compareSemver(current, prevVersion) > 0) {
    return {
      proceed: false,
      reason: `manifest ${current} is ahead of ${prevTag} — release in flight`,
    };
  }

  if (bumped) {
    return { proceed: true, reason: "version bump detected" };
  }

  return {
    proceed: false,
    reason: `no version-bumping commits since ${prevTag}`,
  };
}
