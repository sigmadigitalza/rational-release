/**
 * @module
 *
 * `git add` the prep-commit paths (manifest if version bumped,
 * changelog, mirror destinations, extras), then `git commit` with
 * the prep-commit message. Returns whether a commit was actually
 * made — empty diffs become a no-op so the workflow can short-circuit
 * the downstream force-push step.
 */

import { defaultGitRunner, type GitRunner } from "./git.ts";
import { existsSync } from "node:fs";

/** Inputs to {@link stagePrep}. */
export interface StagePrepOptions {
  /** Path to the manifest (e.g. `deno.json`). Staged only if `bumped`. */
  manifest: string;
  /** Whether the version was bumped (controls manifest staging). */
  bumped: boolean;
  /** Path to the changelog (always staged). */
  changelog: string;
  /** Newline-separated `src:dst` mirror pairs. dst paths are staged. */
  mirrors: string;
  /** Newline-separated extra paths. Existing paths are staged. */
  extras: string;
  /** Version label for the commit message: `chore(release): prep v${version}`. */
  version: string;
  /** `git` runner injection for tests. */
  gitRunner?: GitRunner;
  /** Existence-check injection for tests. */
  pathExists?: (p: string) => boolean;
}

/** Result of {@link stagePrep}. */
export interface StagePrepResult {
  /** Whether a commit was created. False when the staged diff was empty. */
  changed: boolean;
  /** Paths that were `git add`ed. */
  staged: string[];
}

/**
 * Extract destination paths from newline-separated `src:dst` mirror
 * pairs. Pure helper — testable without subprocess. Lines without a
 * `:` or with empty dst are skipped.
 */
export function mirrorDestinations(mirrors: string): string[] {
  const out: string[] = [];
  for (const line of mirrors.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const colon = t.indexOf(":");
    if (colon < 0) continue;
    const dst = t.slice(colon + 1).trim();
    if (dst) out.push(dst);
  }
  return out;
}

/**
 * Parse newline-separated extra paths. Pure helper. Blank lines and
 * `# ...` comments are skipped.
 */
export function parseExtraPaths(extras: string): string[] {
  const out: string[] = [];
  for (const line of extras.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("#")) continue;
    out.push(t);
  }
  return out;
}

/**
 * Stage the prep-commit paths, then commit them. Returns
 * `{changed: false}` if `git diff --cached --quiet` shows no
 * staged changes — the workflow uses this to skip the downstream
 * force-push.
 */
export async function stagePrep(
  opts: StagePrepOptions,
): Promise<StagePrepResult> {
  const git = opts.gitRunner ?? defaultGitRunner;
  const exists = opts.pathExists ?? existsSync;
  const staged: string[] = [];
  const add = async (path: string) => {
    const r = await git(["add", path]);
    if (!r.ok) {
      throw new Error(`git add ${path} failed: ${r.stderr.trim()}`);
    }
    staged.push(path);
  };

  if (opts.bumped) await add(opts.manifest);
  await add(opts.changelog);
  for (const dst of mirrorDestinations(opts.mirrors)) {
    if (exists(dst)) await add(dst);
  }
  for (const path of parseExtraPaths(opts.extras)) {
    if (exists(path)) await add(path);
  }

  // `git diff --cached --quiet` exits 0 (ok=true) if there are NO
  // staged changes, non-zero (ok=false) if there are.
  const diff = await git(["diff", "--cached", "--quiet"]);
  if (diff.ok) return { changed: false, staged };

  const commit = await git([
    "commit",
    "-m",
    `chore(release): prep v${opts.version}`,
  ]);
  if (!commit.ok) {
    throw new Error(`git commit failed: ${commit.stderr.trim()}`);
  }
  return { changed: true, staged };
}
