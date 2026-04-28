/**
 * Build a release-notes changelog from git history.
 *
 * Conventional-changelog-style: groups commits by their conventional-
 * commit type into named sections, generates GitHub compare links
 * between tags, and preserves any historical sections from an existing
 * changelog file.
 *
 * Pure rendering functions are runtime-agnostic; the git-reading
 * helpers shell out via `node:child_process` and work on Deno, Node,
 * and Bun.
 */

import { execFileSync } from "node:child_process";
import { parseSubject } from "./conventional.ts";

export interface CommitEntry {
  sha: string;
  subject: string;
  section: string;
  title: string;
}

export const SECTION_ORDER = [
  "Features",
  "Bug Fixes",
  "Performance Improvements",
  "Refactoring",
  "Reverts",
  "Documentation",
  "Tests",
  "Build System",
  "Continuous Integration",
  "Styles",
  "Chores",
  "Other",
];

export const TYPE_TO_SECTION: Record<string, string> = {
  feat: "Features",
  fix: "Bug Fixes",
  perf: "Performance Improvements",
  refactor: "Refactoring",
  revert: "Reverts",
  docs: "Documentation",
  test: "Tests",
  build: "Build System",
  ci: "Continuous Integration",
  style: "Styles",
  chore: "Chores",
};

export function classifyCommit(
  subject: string,
): { section: string; title: string } {
  const parsed = parseSubject(subject);
  if (!parsed) {
    return { section: "Other", title: subject };
  }
  return {
    section: TYPE_TO_SECTION[parsed.type] ?? "Other",
    title: parsed.description,
  };
}

export function parseGitLogLine(line: string): CommitEntry | null {
  const tab = line.indexOf("\t");
  if (tab < 0) return null;
  const sha = line.slice(0, tab);
  const subject = line.slice(tab + 1);
  if (!sha || !subject) return null;
  const { section, title } = classifyCommit(subject);
  return { sha, subject, section, title };
}

export function groupBySection(
  commits: CommitEntry[],
): Record<string, CommitEntry[]> {
  const grouped: Record<string, CommitEntry[]> = {};
  for (const c of commits) {
    if (!grouped[c.section]) grouped[c.section] = [];
    grouped[c.section].push(c);
  }
  return grouped;
}

/**
 * Pull the historical (non-Unreleased) portion out of an existing
 * changelog. Returns "" if the file has no versioned release headings.
 */
export function readExistingHistory(text: string): string {
  if (!text) return "";
  const m = text.match(/\n(## (?:\[)?[0-9]+\.[0-9]+[\s\S]*)/);
  return m ? m[1].trimEnd() : "";
}

export interface RenderOptions {
  repo: string;
  unreleased?: { commits: CommitEntry[]; fromTag: string | null };
  releases?: Array<{
    version: string;
    fromTag: string | null;
    toTag: string;
    date: string;
    commits: CommitEntry[];
  }>;
  preservedHistory?: string;
}

function renderMarkdownSection(
  heading: string,
  grouped: Record<string, CommitEntry[]>,
  repo: string,
): string[] {
  const lines = [heading, ""];
  const hasAny = SECTION_ORDER.some((n) => (grouped[n] ?? []).length > 0);
  if (!hasAny) {
    lines.push("- _No changes_", "");
    return lines;
  }
  for (const name of SECTION_ORDER) {
    const commits = grouped[name] ?? [];
    if (commits.length === 0) continue;
    lines.push(`### ${name}`, "");
    for (const c of commits) {
      const short = c.sha.slice(0, 7);
      lines.push(
        `* ${c.title} ([${short}](https://github.com/${repo}/commit/${c.sha}))`,
      );
    }
    lines.push("");
  }
  return lines;
}

export function renderMarkdown(opts: RenderOptions): string {
  const lines = [
    "# Changelog",
    "",
    "All notable changes to this project will be documented in this file.",
    "",
    "> ⚠️ **Auto-generated file** — do not edit manually.",
    "",
  ];

  if (opts.unreleased && opts.unreleased.commits.length > 0) {
    const heading = opts.unreleased.fromTag
      ? `## [Unreleased](https://github.com/${opts.repo}/compare/${opts.unreleased.fromTag}...HEAD)`
      : "## [Unreleased]";
    lines.push(
      ...renderMarkdownSection(
        heading,
        groupBySection(opts.unreleased.commits),
        opts.repo,
      ),
    );
  }

  if (opts.preservedHistory) {
    lines.push(opts.preservedHistory);
  } else if (opts.releases) {
    for (const r of opts.releases) {
      const heading = r.fromTag
        ? `## [${r.version}](https://github.com/${opts.repo}/compare/${r.fromTag}...${r.toTag}) (${r.date})`
        : `## [${r.version}](https://github.com/${opts.repo}/releases/tag/${r.toTag}) (${r.date})`;
      lines.push(
        ...renderMarkdownSection(heading, groupBySection(r.commits), opts.repo),
      );
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch]);
}

function renderHtmlSection(
  headingHref: string | null,
  headingText: string,
  metaSuffix: string,
  grouped: Record<string, CommitEntry[]>,
  repo: string,
): string[] {
  const lines: string[] = [];
  const heading = headingHref
    ? `<a href="${escapeHtml(headingHref)}">${escapeHtml(headingText)}</a>`
    : escapeHtml(headingText);
  lines.push(
    `<h2>${heading}${
      metaSuffix ? ` <span class="muted">${escapeHtml(metaSuffix)}</span>` : ""
    }</h2>`,
  );

  const hasAny = SECTION_ORDER.some((n) => (grouped[n] ?? []).length > 0);
  if (!hasAny) {
    lines.push("<p><em>No changes</em></p>");
    return lines;
  }

  for (const name of SECTION_ORDER) {
    const commits = grouped[name] ?? [];
    if (commits.length === 0) continue;
    lines.push(`<h3>${escapeHtml(name)}</h3>`, "<ul>");
    for (const c of commits) {
      const short = c.sha.slice(0, 7);
      const url = `https://github.com/${repo}/commit/${c.sha}`;
      lines.push(
        `  <li>${escapeHtml(c.title)} <a href="${escapeHtml(url)}"><code>${
          escapeHtml(short)
        }</code></a></li>`,
      );
    }
    lines.push("</ul>");
  }

  return lines;
}

export function renderHtml(opts: RenderOptions): string {
  const lines: string[] = [
    "<!doctype html>",
    `<html lang="en">`,
    "<head>",
    `  <meta charset="utf-8">`,
    `  <meta name="viewport" content="width=device-width, initial-scale=1">`,
    `  <title>Changelog — rational-release</title>`,
    `  <meta name="description" content="Auto-generated release notes for rational-release.">`,
    `  <link rel="stylesheet" href="assets/styles.css">`,
    "</head>",
    "<body>",
    `  <header class="site-header">`,
    `    <div class="site-header-inner">`,
    `      <a href="./" class="brand">rational-release</a>`,
    `      <nav class="nav">`,
    `        <a href="./">Overview</a>`,
    `        <a href="tutorial.html">Tutorial</a>`,
    `        <a href="advanced.html">Advanced</a>`,
    `        <a href="changelog.html" class="current">Changelog</a>`,
    `        <a href="https://github.com/${escapeHtml(opts.repo)}">GitHub</a>`,
    `      </nav>`,
    `    </div>`,
    `  </header>`,
    `  <main class="container">`,
    `    <h1>Changelog</h1>`,
    `    <p class="lead">Auto-generated release notes for <code>rational-release</code>. ` +
    `Built from git history during release-PR preparation.</p>`,
  ];

  if (opts.unreleased && opts.unreleased.commits.length > 0) {
    const href = opts.unreleased.fromTag
      ? `https://github.com/${opts.repo}/compare/${opts.unreleased.fromTag}...HEAD`
      : null;
    lines.push(
      ...renderHtmlSection(
        href,
        "Unreleased",
        "",
        groupBySection(opts.unreleased.commits),
        opts.repo,
      ),
    );
  }

  if (opts.releases) {
    for (const r of opts.releases) {
      const href = r.fromTag
        ? `https://github.com/${opts.repo}/compare/${r.fromTag}...${r.toTag}`
        : `https://github.com/${opts.repo}/releases/tag/${r.toTag}`;
      lines.push(
        ...renderHtmlSection(
          href,
          r.version,
          r.date,
          groupBySection(r.commits),
          opts.repo,
        ),
      );
    }
  }

  lines.push(
    `  </main>`,
    `  <footer class="site-footer">`,
    `    <p>`,
    `      <a href="https://github.com/${
      escapeHtml(opts.repo)
    }">GitHub</a> · ` +
      `<a href="https://jsr.io/@sigmadigitalza/rational-release">JSR</a> · ` +
      `<a href="https://sigmadigital.io">sigmadigital.io</a>`,
    `    </p>`,
    `  </footer>`,
    "</body>",
    "</html>",
  );

  return lines.join("\n") + "\n";
}

/** Run a `git` subcommand and return trimmed stdout. */
export function runGit(args: string[], cwd?: string): string {
  return execFileSync("git", ["--no-pager", ...args], {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function parseOriginRepo(remoteUrl: string): string {
  const trimmed = remoteUrl.trim();
  if (trimmed.startsWith("git@github.com:")) {
    return trimmed.replace("git@github.com:", "").replace(/\.git$/, "");
  }
  return trimmed.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
}

export function readCommitsInRange(range: string, cwd?: string): CommitEntry[] {
  const out = runGit(["log", "--pretty=format:%H%x09%s", range], cwd);
  if (!out) return [];
  return out
    .split("\n")
    .map(parseGitLogLine)
    .filter((c): c is CommitEntry => c !== null);
}

/**
 * Strict semver tags only — `vX.Y.Z`. Floating major/minor pins
 * (e.g. `v1`, `v1.2`) are excluded so they don't appear as separate
 * release entries in the changelog.
 */
export function listVersionTags(cwd?: string): string[] {
  const out = runGit(["tag", "--list", "v*", "--sort=-v:refname"], cwd);
  if (!out) return [];
  return out
    .split("\n")
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
}

export function tagDate(tag: string, cwd?: string): string {
  return runGit(["show", "-s", "--format=%ad", "--date=short", tag], cwd);
}
