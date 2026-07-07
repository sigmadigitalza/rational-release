/**
 * @module
 *
 * Decide whether prepare-release should open/update a release PR.
 *
 * Signals feeding in:
 *   - prevTag:  the most recent v* tag (empty string if none yet)
 *   - current:  the version currently in the manifest (X.Y.Z)
 *   - bumped:   whether the conventional-commit walk produced a higher version
 *   - signals:  tag-for-current-exists / open-release-PR (for the stranded
 *               vs in-flight distinction — see below)
 *
 * The subtle case is a manifest that sits *ahead* of the newest tag. That
 * only happens after a release PR has merged (its bumped manifest is on
 * main) but the matching tag doesn't exist yet — which is either:
 *   - a release genuinely in flight (cut-release still running / an open
 *     recovery PR), or
 *   - a *stranded* release: a prior cut-release failed before tagging, so
 *     the manifest is ahead forever and every later run would skip with
 *     "release in flight" — the pipeline wedges silently.
 * The two `signals` disambiguate them so a stranded release self-heals by
 * proceeding (re-releasing the un-cut work) instead of skipping.
 *
 * Splitting the decision out lets us cover the edge cases as unit tests
 * rather than trusting a few `sort -V` lines under bash.
 */

import { parseVersion } from "./version.ts";

/** Verdict returned by {@link releaseGate}. */
export interface GateVerdict {
  proceed: boolean;
  reason: string;
  /**
   * True when `proceed` is a recovery from a stranded release (a prior
   * cut-release failed, leaving the manifest ahead of the newest tag with
   * no tag and no open release PR). The workflow surfaces this loudly.
   */
  recover?: boolean;
}

/**
 * Extra signals that disambiguate a manifest sitting ahead of the newest
 * tag. Without them the gate cannot tell an in-flight release from a
 * stranded one, so it conservatively skips (pre-1.9 behaviour). The
 * workflow always supplies them; ad-hoc callers and older tests may omit.
 */
export interface GateSignals {
  /** Does a tag matching the current manifest version already exist? */
  currentTagExists?: boolean;
  /** Is any `release/v*` PR currently open? */
  openReleasePr?: boolean;
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

/**
 * Decide whether prepare-release should proceed.
 *
 * Returns `proceed: true` on first release (no `prevTag`), when a
 * conventional-commit bump is detected and the manifest is not already
 * ahead of `prevTag`, or when a stranded release is detected (manifest
 * ahead, no matching tag, no open release PR — see {@link GateSignals}).
 * Otherwise returns `proceed: false` with a human-readable `reason`.
 */
export function releaseGate(
  prevTag: string,
  current: string,
  bumped: boolean,
  signals: GateSignals = {},
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

  // Manifest ahead of the newest tag: a release PR merged (its bump is on
  // main) but no matching tag exists yet. Disambiguate in-flight from
  // stranded using the signals; without them, skip conservatively.
  if (isAhead(currentParsed, prevParsed)) {
    // Defensive: v{current} already tagged means the ahead-ness is a stale
    // prev-tag read, not an un-cut release — nothing to open.
    if (signals.currentTagExists) {
      return {
        proceed: false,
        reason: `v${current} is already released`,
      };
    }
    // A release PR (this or a recovery one) is open — cut is pending;
    // opening another would race it.
    if (signals.openReleasePr) {
      return {
        proceed: false,
        reason:
          `manifest ${current} is ahead of ${prevTag} — release in flight (release PR open)`,
      };
    }
    // No tag, no open PR: a prior cut-release stranded this version. Self-
    // heal — proceed so the un-cut work is re-released. The changelog is
    // regenerated from PR history since ${prevTag}, so nothing is lost;
    // the stranded manifest is superseded by the version computed below.
    if (signals.currentTagExists === false && signals.openReleasePr === false) {
      return {
        proceed: true,
        recover: true,
        reason: `recovering stranded release: manifest ${current} has no tag ` +
          `v${current} and no open release PR — a prior cut-release likely ` +
          `failed; re-releasing the un-cut work since ${prevTag}`,
      };
    }
    // Signals not supplied (older caller): keep the pre-1.9 conservative
    // skip rather than risk a double-open.
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
