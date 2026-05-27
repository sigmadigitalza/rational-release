/**
 * @module
 *
 * Find open release PRs whose head branch starts with the configured
 * prefix but isn't the one we just opened, and close them (with a
 * "superseded by" comment + branch delete). Used to prevent parallel
 * release PRs when the implied semver bump tier escalates between
 * prepare-release runs (e.g. a `feat:` lands while a `release/v0.9.1`
 * patch PR is still open — the next run opens `release/v0.10.0` and
 * this sweep closes the now-stale `release/v0.9.1`).
 */

import { defaultGhRunner, type GhRunner } from "./gh.ts";

/** Inputs to {@link supersedeStale}. */
export interface SupersedeOptions {
  /** Release-branch prefix (e.g. `release/v`). Empty prefix is rejected. */
  prefix: string;
  /** The branch we just opened / refreshed (excluded from the sweep). */
  currentBranch: string;
  /** Version label used in the close-comment text. */
  version: string;
  /** Base branch the PRs target. Default `main`. */
  base?: string;
  /** Max PRs to consider in one sweep. Default 200. */
  limit?: number;
  /** `gh` runner injection for tests. */
  ghRunner?: GhRunner;
}

/** One open PR as returned by `gh pr list`. */
export interface OpenPr {
  number: number;
  headRefName: string;
}

/** Per-PR action result. */
export interface PrAction {
  number: number;
  headRefName: string;
}

/** Result of {@link supersedeStale}. */
export interface SupersedeResult {
  /** PRs the sweep would consider stale and try to close. */
  matched: OpenPr[];
  /** Successfully closed. */
  closed: PrAction[];
  /** Close attempt failed (PR still open; surfaced as a warning). */
  failed: (PrAction & { error: string })[];
  /** Skipped because prefix was empty. */
  skipped: boolean;
}

const DEFAULT_BASE = "main";
const DEFAULT_LIMIT = 200;

/**
 * Filter `prs` to those starting with `prefix` but not equal to
 * `currentBranch`. Pure function — testable without subprocess.
 */
export function filterStale(
  prs: readonly OpenPr[],
  prefix: string,
  currentBranch: string,
): OpenPr[] {
  if (!prefix) return [];
  return prs.filter(
    (p) =>
      p.headRefName.startsWith(prefix) &&
      p.headRefName !== currentBranch,
  );
}

/**
 * Strip backticks from a branch name before rendering inside a
 * Markdown inline-code span. git-check-ref-format permits backticks
 * in branch names; for fork-PRs the fork owner controls the name, so
 * sanitising stops markdown-injection into `$GITHUB_STEP_SUMMARY`.
 */
export function safeRef(ref: string): string {
  return ref.replaceAll("`", "");
}

/**
 * List open release PRs and close the stale ones. Returns a summary
 * the caller (CLI driver) renders to step summary / warnings.
 */
export async function supersedeStale(
  opts: SupersedeOptions,
): Promise<SupersedeResult> {
  if (!opts.prefix) {
    return { matched: [], closed: [], failed: [], skipped: true };
  }
  const base = opts.base ?? DEFAULT_BASE;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const gh = opts.ghRunner ?? defaultGhRunner;

  const listResult = await gh([
    "pr",
    "list",
    "--base",
    base,
    "--state",
    "open",
    "--limit",
    String(limit),
    "--json",
    "number,headRefName",
  ]);
  if (!listResult.ok) {
    throw new Error(`gh pr list failed: ${listResult.stderr.trim()}`);
  }
  // Trim before the `|| "[]"` fallback so whitespace-only output
  // (e.g. a stray "\n") still parses as an empty array.
  const allPrs: OpenPr[] = JSON.parse(listResult.stdout.trim() || "[]");
  const matched = filterStale(allPrs, opts.prefix, opts.currentBranch);

  const closed: PrAction[] = [];
  const failed: (PrAction & { error: string })[] = [];
  const comment =
    `Superseded by the v${opts.version} release PR — the implied bump ` +
    "escalated since this PR was opened.";

  for (const pr of matched) {
    const result = await gh([
      "pr",
      "close",
      String(pr.number),
      "--comment",
      comment,
      "--delete-branch",
    ]);
    if (result.ok) {
      closed.push({ number: pr.number, headRefName: pr.headRefName });
    } else {
      failed.push({
        number: pr.number,
        headRefName: pr.headRefName,
        error: result.stderr.trim(),
      });
    }
  }
  return { matched, closed, failed, skipped: false };
}
