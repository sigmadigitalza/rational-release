/**
 * @module
 *
 * Strip a release-branch prefix and validate the remainder as X.Y.Z.
 *
 * This is a security gate: cut-release uses the resulting version to tag
 * the repo. A bad parse here would let a crafted branch name produce an
 * unexpected tag, so the regex is intentionally strict (no leading "v",
 * no pre-release/build metadata) and rejects anything else.
 */

const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/;

/**
 * Strip `prefix` from `branch` and return the remainder if it is strict
 * X.Y.Z. Throws if `prefix` is empty, the branch does not start with
 * `prefix`, or the remainder is not strict semver.
 *
 * @example
 * ```ts
 * branchVersion("release/v1.2.3", "release/v"); // "1.2.3"
 * branchVersion("release/v1.2", "release/v");   // throws
 * ```
 */
export function branchVersion(branch: string, prefix: string): string {
  if (!prefix) {
    throw new Error("branch-version: prefix must be non-empty");
  }
  if (!branch.startsWith(prefix)) {
    throw new Error(
      `branch-version: branch "${branch}" does not start with prefix "${prefix}"`,
    );
  }
  const version = branch.slice(prefix.length);
  if (!SEMVER_RE.test(version)) {
    throw new Error(
      `branch-version: branch "${branch}" did not yield a valid X.Y.Z after stripping "${prefix}" (got "${version}")`,
    );
  }
  return version;
}
