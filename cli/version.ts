/**
 * @module
 *
 * Pure version arithmetic. Given a current X.Y.Z and a bump kind, return
 * the next X.Y.Z. Pre-1.0 cap optionally downgrades major→minor (a
 * breaking change pre-stability is still just the next minor).
 */

import type { Bump } from "./conventional.ts";

/**
 * Parse a strict X.Y.Z semver string into its numeric parts.
 *
 * Throws if the input is not three dot-separated non-negative integers.
 * Pre-release suffixes (`-rc.1`) and build metadata (`+abc`) are not
 * accepted — this is intentional, since rational-release tags are
 * strict semver only.
 *
 * @example
 * ```ts
 * parseVersion("1.2.3"); // [1, 2, 3]
 * parseVersion("1.2");   // throws: Unparseable version: 1.2
 * ```
 */
export function parseVersion(v: string): [number, number, number] {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`Unparseable version: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Apply a {@link Bump} to a current X.Y.Z and return the next X.Y.Z.
 *
 * With `pre1Cap: true`, a `major` bump while still on `0.x.y` is
 * downgraded to `minor` (so `feat!:` on `0.7.0` becomes `0.8.0`, not
 * `1.0.0`). A `none` bump returns the input unchanged.
 *
 * @example
 * ```ts
 * nextVersion("1.2.3", "minor");                       // "1.3.0"
 * nextVersion("0.7.0", "major", { pre1Cap: true });    // "0.8.0"
 * nextVersion("0.7.0", "major");                        // "1.0.0"
 * nextVersion("1.2.3", "none");                         // "1.2.3"
 * ```
 */
export function nextVersion(
  current: string,
  bump: Bump,
  options: { pre1Cap?: boolean } = {},
): string {
  const [major, minor, patch] = parseVersion(current);
  const effective: Bump = options.pre1Cap && major === 0 && bump === "major"
    ? "minor"
    : bump;
  switch (effective) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    case "none":
      return current;
  }
}
