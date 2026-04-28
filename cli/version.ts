/**
 * Pure version arithmetic. Given a current X.Y.Z and a bump kind, return
 * the next X.Y.Z. Pre-1.0 cap optionally downgrades major→minor (a
 * breaking change pre-stability is still just the next minor).
 */

import type { Bump } from "./conventional.ts";

export function parseVersion(v: string): [number, number, number] {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`Unparseable version: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

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
