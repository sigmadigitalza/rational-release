/**
 * Keep-a-Changelog operations: generate the [Unreleased] body from PRs,
 * finalise [Unreleased] → [X.Y.Z] - date, and extract a single version's
 * section as plain text for release-notes bodies.
 */

import { parseSubject } from "./conventional.ts";

/**
 * A fresh Keep-a-Changelog skeleton with an empty [Unreleased] section.
 * Used to bootstrap repos that don't yet have a CHANGELOG.md.
 */
export function bootstrapTemplate(): string {
  return [
    "# Changelog",
    "",
    "All notable changes to this project will be documented in this file.",
    "",
    "The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),",
    "and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).",
    "",
    "## [Unreleased]",
    "",
    "### Added",
    "",
    "### Changed",
    "",
    "### Fixed",
    "",
    "### Removed",
    "",
  ].join("\n");
}

export interface MergedPr {
  number: number;
  title: string;
  mergedAt?: string;
  author?: { login?: string; is_bot?: boolean };
}

const TYPE_TO_BUCKET: Record<string, string> = {
  feat: "Added",
  fix: "Fixed",
  perf: "Changed",
  refactor: "Changed",
  style: "Changed",
  build: "Changed",
  ci: "Changed",
  docs: "Changed",
  chore: "Changed",
  test: "Changed",
  revert: "Removed",
};

const BUCKET_ORDER = ["Added", "Changed", "Fixed", "Removed", "Other"];

const META_TITLE_RE = /^(Release v\d|chore\(release\):)/i;

export function bucketPrs(prs: MergedPr[]): Map<string, string[]> {
  const buckets = new Map<string, string[]>();
  const sorted = [...prs].sort((a, b) => a.number - b.number);
  for (const pr of sorted) {
    const title = pr.title.trim();
    if (META_TITLE_RE.test(title)) continue;

    const parsed = parseSubject(title);
    const type = parsed?.type ?? "";
    const subject = parsed?.description ?? title;
    const bucket = TYPE_TO_BUCKET[type] ?? "Other";

    const login = pr.author?.login ?? "unknown";
    const attribution = pr.author?.is_bot
      ? `#${pr.number}`
      : `#${pr.number} by @${login}`;
    const line = `- ${subject} (${attribution})`;

    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket)!.push(line);
  }
  return buckets;
}

export function renderUnreleased(buckets: Map<string, string[]>): string {
  const out: string[] = [];
  for (const name of BUCKET_ORDER) {
    const lines = buckets.get(name);
    if (!lines || lines.length === 0) continue;
    out.push(`### ${name}`, "", ...lines, "");
  }
  if (out.length === 0) {
    out.push("_No user-visible changes since the previous release._", "");
  }
  return out.join("\n");
}

export function rewriteUnreleased(changelog: string, body: string): string {
  const headerRe = /^## \[Unreleased\][^\n]*\n/m;
  const nextSectionRe = /\n## \[(?!Unreleased)/;

  if (!headerRe.test(changelog)) {
    throw new Error(
      "CHANGELOG.md has no `## [Unreleased]` section. " +
        "Add one (with the Keep-a-Changelog header) before this script can run.",
    );
  }

  const headerMatch = changelog.match(headerRe)!;
  const headerStart = headerMatch.index!;
  const afterHeader = headerStart + headerMatch[0].length;

  const tail = changelog.slice(afterHeader);
  const nextMatch = tail.match(nextSectionRe);
  const nextOffset = nextMatch
    ? afterHeader + nextMatch.index! + 1
    : changelog.length;

  const before = changelog.slice(0, afterHeader);
  const after = changelog.slice(nextOffset);

  const trimmedBody = body.replace(/\n+$/, "\n");
  return `${before}\n${trimmedBody}${
    after.startsWith("\n") ? after : "\n" + after
  }`;
}

/**
 * Finalise [Unreleased] → [X.Y.Z] - YYYY-MM-DD and prepend a fresh empty
 * [Unreleased] template above it.
 */
export function finaliseUnreleased(
  changelog: string,
  version: string,
  date: string,
): string {
  const headerRe = /^## \[Unreleased\][^\n]*\n/m;
  if (!headerRe.test(changelog)) {
    throw new Error(
      "CHANGELOG.md has no `## [Unreleased]` section to finalise.",
    );
  }
  const fresh = [
    "## [Unreleased]",
    "",
    "### Added",
    "",
    "### Changed",
    "",
    "### Fixed",
    "",
    "### Removed",
    "",
    `## [${version}] - ${date}`,
    "",
  ].join("\n");
  return changelog.replace(headerRe, fresh);
}

/**
 * Extract the body of `## [version]` (no header line). Returns the empty
 * string if the section is missing.
 */
export function extractSection(changelog: string, version: string): string {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerRe = new RegExp(`^## \\[${escaped}\\][^\\n]*\\n`, "m");
  const m = changelog.match(headerRe);
  if (!m) return "";
  const start = m.index! + m[0].length;
  const tail = changelog.slice(start);
  const nextMatch = tail.match(/\n## \[/);
  const end = nextMatch ? start + nextMatch.index! + 1 : changelog.length;
  return changelog.slice(start, end).replace(/\n+$/, "\n");
}
