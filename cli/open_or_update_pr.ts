/**
 * @module
 *
 * Idempotent "open or update a release PR" — looks up the open PR
 * whose head matches the release branch, and either edits it
 * (title + body) or creates a new one. Body is constructed from a
 * preview snippet (the freshly-regenerated `[Unreleased]` section)
 * plus a header that names the prev → next version transition.
 */

import { writeFile } from "node:fs/promises";
import { defaultGhRunner, type GhRunner } from "./gh.ts";

/** Inputs to {@link openOrUpdateReleasePr}. */
export interface OpenOrUpdateOptions {
  /** Base branch the PR targets. Default `main`. */
  base?: string;
  /** Head branch the PR ships from. */
  head: string;
  /** Version label for title + body header. */
  version: string;
  /** Previous manifest version (shown in body header). */
  prevVersion: string;
  /** Body content for the "Changelog preview" section. */
  unreleased: string;
  /** Path to write the rendered body to. Default `body.md`. */
  bodyFile?: string;
  /** `gh` runner injection for tests. */
  ghRunner?: GhRunner;
  /** File-writer injection for tests. */
  writer?: (path: string, content: string) => Promise<void>;
}

/** Result of {@link openOrUpdateReleasePr}. */
export interface OpenOrUpdateResult {
  /** "opened" if a new PR was created, "updated" if existing was edited. */
  action: "opened" | "updated";
  /** PR number (only set when action == updated; gh pr create doesn't return it on stdout in our usage). */
  number: number | null;
}

const DEFAULT_BASE = "main";
const DEFAULT_BODY_FILE = "body.md";

const defaultWriter = (path: string, content: string) =>
  writeFile(path, content);

/**
 * Render the PR body. Pure function — testable.
 */
export function renderBody(opts: {
  version: string;
  prevVersion: string;
  unreleased: string;
}): string {
  const body = opts.unreleased.trim() || "_No entries in [Unreleased]._";
  return [
    `## Release v${opts.version}`,
    "",
    `Auto-bumped from \`${opts.prevVersion}\` based on conventional commits since the previous release.`,
    "",
    `Merging this PR will tag \`v${opts.version}\` and publish a GitHub Release.`,
    "",
    "### Changelog preview",
    "",
    body,
    "",
  ].join("\n");
}

/**
 * Look up a PR whose head ref is `head` against `base`. Returns the
 * PR number (first match) or `null` if none. Helper so the caller
 * can pre-check.
 */
export async function findOpenPrByHead(
  head: string,
  base: string,
  gh: GhRunner,
): Promise<number | null> {
  const result = await gh([
    "pr",
    "list",
    "--head",
    head,
    "--base",
    base,
    "--state",
    "open",
    "--json",
    "number",
  ]);
  if (!result.ok) {
    throw new Error(`gh pr list failed: ${result.stderr.trim()}`);
  }
  const parsed: { number: number }[] = JSON.parse(
    result.stdout.trim() || "[]",
  );
  return parsed[0]?.number ?? null;
}

/**
 * Look up the existing release PR (if any) and either edit it or
 * create a new one. Body is written to `bodyFile` first so the
 * `gh pr create --body-file` / `gh pr edit --body-file` flags can
 * point at it (avoids embedding multi-line markdown in argv).
 */
export async function openOrUpdateReleasePr(
  opts: OpenOrUpdateOptions,
): Promise<OpenOrUpdateResult> {
  const base = opts.base ?? DEFAULT_BASE;
  const bodyFile = opts.bodyFile ?? DEFAULT_BODY_FILE;
  const gh = opts.ghRunner ?? defaultGhRunner;
  const write = opts.writer ?? defaultWriter;

  const body = renderBody({
    version: opts.version,
    prevVersion: opts.prevVersion,
    unreleased: opts.unreleased,
  });
  await write(bodyFile, body);

  const title = `Release v${opts.version}`;
  const existing = await findOpenPrByHead(opts.head, base, gh);
  if (existing !== null) {
    const result = await gh([
      "pr",
      "edit",
      String(existing),
      "--title",
      title,
      "--body-file",
      bodyFile,
    ]);
    if (!result.ok) {
      throw new Error(`gh pr edit failed: ${result.stderr.trim()}`);
    }
    return { action: "updated", number: existing };
  }
  const result = await gh([
    "pr",
    "create",
    "--base",
    base,
    "--head",
    opts.head,
    "--title",
    title,
    "--body-file",
    bodyFile,
  ]);
  if (!result.ok) {
    throw new Error(`gh pr create failed: ${result.stderr.trim()}`);
  }
  return { action: "opened", number: null };
}
