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

type Parsed = [number, number, number];

function tryParse(v: string): Parsed | null {
  try {
    return parseVersion(v);
  } catch {
    return null;
  }
}

function isAhead(a: Parsed, b: Parsed): boolean {
  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[2] > b[2];
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

  // Defensive parsing: a tag like `v1.0` or `v0.5-beta` is technically
  // matched by `git tag --list 'v*'` even though it isn't strict X.Y.Z.
  // Rather than crashing the workflow, fall back to a bumped-only gate
  // and explain why the in-flight check was skipped.
  const currentParsed = tryParse(current);
  if (!currentParsed) {
    return {
      proceed: false,
      reason:
        `manifest version "${current}" is not strict X.Y.Z — refusing to gate`,
    };
  }

  const prevParsed = tryParse(stripV(prevTag));
  if (!prevParsed) {
    if (bumped) {
      return {
        proceed: true,
        reason:
          `version bump detected (previous tag ${prevTag} is not strict semver — in-flight check skipped)`,
      };
    }
    return {
      proceed: false,
      reason: `no version-bumping commits since ${prevTag}`,
    };
  }

  // If the manifest is already ahead of the previous tag, a release is in
  // flight: a release PR was merged (manifest bumped, finalisation commit
  // landed) but cut-release hasn't tagged yet, or someone bumped manually.
  // Opening another release PR on top would race the cut.
  if (isAhead(currentParsed, prevParsed)) {
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
