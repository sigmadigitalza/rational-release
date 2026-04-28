#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * @module @sigmadigitalza/rational-release
 *
 * CLI entry point. Subcommands:
 *
 *     next-version        Compute the next semver from conventional commits.
 *     changelog-generate  Rewrite the [Unreleased] section from merged PRs.
 *     changelog-finalise  Promote [Unreleased] to [X.Y.Z] - date.
 *     extract-section     Print the body of a single [version] section.
 *
 * Each subcommand reads explicit arguments — no env-var magic. Designed
 * to be invoked from GitHub Actions reusable workflows that wrap them.
 *
 * Usage:
 *
 *     deno run jsr:@sigmadigitalza/rational-release <subcommand> [args...]
 *
 * Or pinned to a tag from raw GitHub:
 *
 *     deno run https://raw.githubusercontent.com/sigmadigitalza/rational-release/v1/cli/mod.ts <subcommand> ...
 */

import { appendFile, readFile, writeFile } from "node:fs/promises";
import process from "node:process";

import { highestBump } from "./conventional.ts";
import { nextVersion } from "./version.ts";
import { readManifestVersion, writeManifestVersion } from "./manifest.ts";
import {
  bootstrapTemplate,
  bucketPrs,
  extractSection,
  finaliseUnreleased,
  renderUnreleased,
  rewriteUnreleased,
} from "./changelog.ts";
import {
  type CommitsVerdict,
  DEFAULT_ALLOWED_TYPES,
  type TitleVerdict,
  validateCommits,
  validateTitle,
} from "./validate.ts";
import {
  type CommitEntry,
  listVersionTags,
  parseOriginRepo,
  readCommitsInRange,
  readExistingHistory,
  renderHtml,
  renderMarkdown,
  runGit,
  tagDate,
} from "./build_changelog.ts";

const USAGE = `\
rational-release <subcommand> [args...]

Subcommands:
  next-version <manifest> [--jsonpath $.version] [--pre-1.0-cap] [--commits-file FILE]
      Print the next semver. Reads commit subjects from --commits-file
      or stdin (one subject per line).

  read-version <manifest> [--jsonpath $.version]
      Print the current version from the manifest.

  set-version <manifest> <version> [--jsonpath $.version]
      Update the manifest's version field in place. Preserves indentation
      and trailing newline.

  changelog-generate <prs.json> <changelog.md> [--bootstrap]
      Rewrite the [Unreleased] section in place from merged PRs.
      With --bootstrap, create a Keep-a-Changelog skeleton if the
      file doesn't exist yet.

  changelog-finalise <changelog.md> <version> [--date YYYY-MM-DD]
      Promote [Unreleased] to [version] - date and prepend a fresh empty
      [Unreleased] block. Date defaults to today (UTC).

  extract-section <changelog.md> <version>
      Print the body of [version] to stdout. Empty if missing.

  validate-title [<title>] [--from-env VAR] [--require-scope]
      Validate a single PR title against Conventional Commits. Reads from
      the positional arg, then --from-env VAR (default PR_TITLE), then
      stdin. Writes a markdown report to GITHUB_STEP_SUMMARY when set.
      Exit 0 = valid, 1 = invalid.

  validate-commits [<msg>...] [--commits-file FILE] [--from-env VAR]
                   [--separator SEP] [--require-scope]
      Validate a list of commit-message headers. Sources, in order:
      positional args, --commits-file (one message per line, or split on
      --separator), --from-env VAR (split on --separator, default
      ---COMMIT_SEP---), or stdin. Merge commits and "Initial plan" are
      skipped. Writes a markdown summary to GITHUB_STEP_SUMMARY when set.
      Exit 0 = all valid, 1 = any invalid.

  build-changelog [--output PATH] [--format md|html] [--repo OWNER/REPO]
                  [--preserve-from FILE] [--next-version VER]
                  [--next-date YYYY-MM-DD] [--cwd DIR]
      Generate a conventional-changelog-style file from git history.
      Groups commits by type into sections, builds GitHub compare links
      between version tags, and (with --preserve-from) keeps historical
      release sections from an existing changelog. Format defaults to md;
      html produces a styled page that matches the docs site.

      Pass --next-version <X.Y.Z> during release-prep to attribute the
      commits since the latest tag to the upcoming release (with today's
      date, or --next-date if you need to override) rather than to the
      Unreleased bucket. The generated compare link points at v<X.Y.Z>,
      which becomes valid once cut-release tags it.
`;

async function readStdin(): Promise<string> {
  process.stdin.setEncoding("utf-8");
  let text = "";
  for await (const chunk of process.stdin) {
    text += chunk;
  }
  return text;
}

async function readSubjects(
  commitsFile: string | undefined,
): Promise<string[]> {
  const text = commitsFile
    ? await readFile(commitsFile, "utf-8")
    : await readStdin();
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

function takeFlag(args: string[], name: string): boolean {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
}

function takeOption(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  if (value == null) throw new Error(`Missing value for ${name}`);
  args.splice(i, 2);
  return value;
}

async function cmdNextVersion(args: string[]): Promise<void> {
  const jsonpath = takeOption(args, "--jsonpath") ?? "$.version";
  const pre1Cap = takeFlag(args, "--pre-1.0-cap");
  const commitsFile = takeOption(args, "--commits-file");
  const [manifestPath] = args;
  if (!manifestPath) {
    console.error("usage: next-version <manifest> [...]");
    process.exit(2);
  }
  const current = await readManifestVersion(manifestPath, jsonpath);
  const subjects = await readSubjects(commitsFile);
  const bump = highestBump(subjects);
  const next = nextVersion(current, bump, { pre1Cap });
  console.log(next);
}

async function cmdReadVersion(args: string[]): Promise<void> {
  const jsonpath = takeOption(args, "--jsonpath") ?? "$.version";
  const [manifestPath] = args;
  if (!manifestPath) {
    console.error("usage: read-version <manifest> [--jsonpath $.version]");
    process.exit(2);
  }
  console.log(await readManifestVersion(manifestPath, jsonpath));
}

async function cmdSetVersion(args: string[]): Promise<void> {
  const jsonpath = takeOption(args, "--jsonpath") ?? "$.version";
  const [manifestPath, version] = args;
  if (!manifestPath || !version) {
    console.error(
      "usage: set-version <manifest> <version> [--jsonpath $.version]",
    );
    process.exit(2);
  }
  await writeManifestVersion(manifestPath, jsonpath, version);
}

async function cmdChangelogGenerate(args: string[]): Promise<void> {
  const bootstrap = takeFlag(args, "--bootstrap");
  const [prsPath, changelogPath] = args;
  if (!prsPath || !changelogPath) {
    console.error(
      "usage: changelog-generate <prs.json> <changelog.md> [--bootstrap]",
    );
    process.exit(2);
  }
  const prs = JSON.parse(await readFile(prsPath, "utf-8"));
  let changelog: string;
  try {
    changelog = await readFile(changelogPath, "utf-8");
  } catch (err) {
    if (
      bootstrap &&
      typeof err === "object" &&
      err !== null &&
      (err as { code?: string }).code === "ENOENT"
    ) {
      changelog = bootstrapTemplate();
    } else {
      throw err;
    }
  }
  const buckets = bucketPrs(prs);
  const body = renderUnreleased(buckets);
  const updated = rewriteUnreleased(changelog, body);
  await writeFile(changelogPath, updated);
}

async function cmdChangelogFinalise(args: string[]): Promise<void> {
  const date = takeOption(args, "--date") ??
    new Date().toISOString().slice(0, 10);
  const [changelogPath, version] = args;
  if (!changelogPath || !version) {
    console.error(
      "usage: changelog-finalise <changelog.md> <version> [--date YYYY-MM-DD]",
    );
    process.exit(2);
  }
  const changelog = await readFile(changelogPath, "utf-8");
  const updated = finaliseUnreleased(changelog, version, date);
  await writeFile(changelogPath, updated);
}

async function cmdExtractSection(args: string[]): Promise<void> {
  const [changelogPath, version] = args;
  if (!changelogPath || !version) {
    console.error("usage: extract-section <changelog.md> <version>");
    process.exit(2);
  }
  const changelog = await readFile(changelogPath, "utf-8");
  const body = extractSection(changelog, version);
  process.stdout.write(body);
}

async function appendStepSummary(text: string): Promise<void> {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  await appendFile(path, text);
}

function renderTitleSummary(title: string, verdict: TitleVerdict): string {
  const lines: string[] = [];
  if (verdict.ok) {
    lines.push("## ✅ PR Title Validation Passed", "");
    lines.push(`Title \`${title}\` follows the Conventional Commits spec.`);
  } else {
    lines.push("## ❌ PR Title Validation Failed", "");
    lines.push(`Checked title: \`${title || "<empty>"}\``, "");
    lines.push("### Errors", "");
    for (const err of verdict.errors) lines.push(`- ${err}`);
    lines.push("");
    lines.push("PR title must follow: `type[(scope)]: description`", "");
    lines.push(`Allowed types: \`${DEFAULT_ALLOWED_TYPES.join("`, `")}\``);
  }
  return lines.join("\n") + "\n";
}

async function cmdValidateTitle(args: string[]): Promise<void> {
  const fromEnv = takeOption(args, "--from-env") ?? "PR_TITLE";
  const requireScope = takeFlag(args, "--require-scope");
  const positional = args[0];
  const title = (
    positional ??
      process.env[fromEnv] ??
      (process.stdin.isTTY ? "" : await readStdin())
  ).trim();

  const verdict = validateTitle(title, { requireScope });
  if (verdict.ok) {
    console.log(`✅  PR title is valid: "${title}"`);
  } else {
    console.error(`❌  PR title is invalid: "${title}"`);
    for (const err of verdict.errors) console.error(`    • ${err}`);
  }
  await appendStepSummary(renderTitleSummary(title, verdict));
  if (!verdict.ok) process.exit(1);
}

function renderCommitsSummary(verdict: CommitsVerdict): string {
  const total = verdict.results.length;
  const lines: string[] = [];
  if (verdict.failed === 0) {
    lines.push("## ✅ Commit Message Validation Passed", "");
    lines.push(
      `All **${total}** commit message(s) follow the Conventional Commits spec.`,
    );
  } else {
    lines.push("## ❌ Commit Message Validation Failed", "");
    lines.push(
      `**${verdict.failed}** commit(s) failed validation out of **${total}** commit(s) checked.`,
      "",
    );
    lines.push("### Errors", "");
    for (const r of verdict.results) {
      if (r.ok) continue;
      lines.push(`#### \`${r.header}\``);
      for (const err of r.errors) lines.push(`- ${err}`);
      lines.push("");
    }
    lines.push("### Conventional Commits Spec", "");
    lines.push("Commit messages must follow: `type[(scope)]: description`", "");
    lines.push(`- **type**: one of \`${DEFAULT_ALLOWED_TYPES.join("`, `")}\``);
    lines.push("- **scope**: optional, in parentheses");
    lines.push("- **description**: non-empty summary");
  }
  return lines.join("\n") + "\n";
}

async function readCommitMessages(
  args: string[],
  commitsFile: string | undefined,
  fromEnv: string | undefined,
  separator: string,
): Promise<string[]> {
  if (args.length > 0) return args;

  if (commitsFile) {
    const text = await readFile(commitsFile, "utf-8");
    if (text.includes(separator)) {
      return text.split(separator).map((m) => m.trim()).filter(Boolean);
    }
    return text.split("\n").map((m) => m.trim()).filter(Boolean);
  }

  if (fromEnv) {
    const raw = process.env[fromEnv] ?? "";
    if (raw) {
      return raw.split(separator).map((m) => m.trim()).filter(Boolean);
    }
  }

  if (!process.stdin.isTTY) {
    const text = await readStdin();
    if (text.includes(separator)) {
      return text.split(separator).map((m) => m.trim()).filter(Boolean);
    }
    return text.split("\n").map((m) => m.trim()).filter(Boolean);
  }

  return [];
}

async function cmdValidateCommits(args: string[]): Promise<void> {
  const commitsFile = takeOption(args, "--commits-file");
  const fromEnv = takeOption(args, "--from-env") ?? "COMMIT_MESSAGES";
  const separator = takeOption(args, "--separator") ?? "---COMMIT_SEP---";
  const requireScope = takeFlag(args, "--require-scope");

  const messages = await readCommitMessages(
    args,
    commitsFile,
    fromEnv,
    separator,
  );
  if (messages.length === 0) {
    console.log("No commit messages to validate.");
    return;
  }

  const verdict = validateCommits(messages, { requireScope });
  for (const r of verdict.results) {
    if (r.skipped) continue;
    if (r.ok) {
      console.log(`✅  ${r.header}`);
    } else {
      console.error(`\n❌  ${r.header}`);
      for (const err of r.errors) console.error(`    • ${err}`);
    }
  }
  console.log(
    `\n--- Summary: ${verdict.passed} passed, ${verdict.failed} failed, ${verdict.skipped} skipped out of ${messages.length} commit(s) ---`,
  );
  await appendStepSummary(renderCommitsSummary(verdict));
  if (verdict.failed > 0) process.exit(1);
}

interface ReleaseRange {
  version: string;
  fromTag: string | null;
  toTag: string;
  date: string;
  commits: CommitEntry[];
}

function buildReleaseRanges(tags: string[], cwd?: string): ReleaseRange[] {
  const ranges: ReleaseRange[] = [];
  for (let i = 0; i < tags.length; i += 1) {
    const toTag = tags[i];
    const fromTag = tags[i + 1] ?? null;
    const range = fromTag ? `${fromTag}..${toTag}` : toTag;
    ranges.push({
      version: toTag.replace(/^v/, ""),
      fromTag,
      toTag,
      date: tagDate(toTag, cwd),
      commits: readCommitsInRange(range, cwd),
    });
  }
  return ranges;
}

async function cmdBuildChangelog(args: string[]): Promise<void> {
  const output = takeOption(args, "--output") ?? "CHANGELOG.md";
  const format = takeOption(args, "--format") ?? "md";
  const repoOpt = takeOption(args, "--repo");
  const preserveFrom = takeOption(args, "--preserve-from");
  const cwd = takeOption(args, "--cwd");
  const nextVersion = takeOption(args, "--next-version");
  const nextDate = takeOption(args, "--next-date");

  if (format !== "md" && format !== "html") {
    console.error(`--format must be "md" or "html", got "${format}"`);
    process.exit(2);
  }

  if (nextDate && !nextVersion) {
    console.error("--next-date requires --next-version");
    process.exit(2);
  }

  if (nextVersion && preserveFrom) {
    console.error("--next-version and --preserve-from cannot be used together");
    process.exit(2);
  }

  // Strip an optional leading "v" and validate X.Y.Z semver form.
  const normalizedNextVersion = nextVersion
    ? (() => {
      const v = nextVersion.replace(/^v/, "");
      if (!/^\d+\.\d+\.\d+$/.test(v)) {
        console.error(
          `--next-version must be X.Y.Z (e.g. 1.2.3), got "${nextVersion}"`,
        );
        process.exit(2);
      }
      return v;
    })()
    : null;

  const repo = repoOpt ??
    parseOriginRepo(runGit(["config", "--get", "remote.origin.url"], cwd));
  const tags = listVersionTags(cwd);
  const latestTag = tags[0] ?? null;

  // When `--next-version` is set, the commits since the latest tag belong
  // to the upcoming release rather than the Unreleased bucket. This is
  // what `prepare-release` wants: it knows the tag that will be cut once
  // its release PR merges, so the docs can be written with that tag in
  // place. Without this flag, the same commits surface under Unreleased
  // (which is correct outside a release-prep run).
  const pendingCommits = readCommitsInRange(
    latestTag ? `${latestTag}..HEAD` : "HEAD",
    cwd,
  );
  const unreleased = normalizedNextVersion ? undefined : {
    commits: pendingCommits,
    fromTag: latestTag,
  };
  const pendingRelease = normalizedNextVersion
    ? {
      version: normalizedNextVersion,
      fromTag: latestTag,
      toTag: `v${normalizedNextVersion}`,
      date: nextDate ?? new Date().toISOString().slice(0, 10),
      commits: pendingCommits,
    }
    : null;

  let preservedHistory: string | undefined;
  if (preserveFrom) {
    try {
      const text = await readFile(preserveFrom, "utf-8");
      const history = readExistingHistory(text);
      if (history) preservedHistory = history;
    } catch (err) {
      if (
        typeof err !== "object" || err === null ||
        (err as { code?: string }).code !== "ENOENT"
      ) {
        throw err;
      }
    }
  }

  const tagReleases = preservedHistory
    ? undefined
    : buildReleaseRanges(tags, cwd);
  const releases = pendingRelease
    ? [pendingRelease, ...(tagReleases ?? [])]
    : tagReleases;

  const rendered = format === "html"
    ? renderHtml({ repo, unreleased, releases, preservedHistory })
    : renderMarkdown({ repo, unreleased, releases, preservedHistory });

  await writeFile(output, rendered);
  console.log(`✅  Changelog written to ${output}`);
}

async function main(): Promise<void> {
  const [sub, ...rest] = process.argv.slice(2);
  switch (sub) {
    case "next-version":
      await cmdNextVersion(rest);
      return;
    case "read-version":
      await cmdReadVersion(rest);
      return;
    case "set-version":
      await cmdSetVersion(rest);
      return;
    case "changelog-generate":
      await cmdChangelogGenerate(rest);
      return;
    case "changelog-finalise":
      await cmdChangelogFinalise(rest);
      return;
    case "extract-section":
      await cmdExtractSection(rest);
      return;
    case "validate-title":
      await cmdValidateTitle(rest);
      return;
    case "validate-commits":
      await cmdValidateCommits(rest);
      return;
    case "build-changelog":
      await cmdBuildChangelog(rest);
      return;
    case "--help":
    case "-h":
    case undefined:
      console.log(USAGE);
      return;
    default:
      console.error(`Unknown subcommand: ${sub}\n\n${USAGE}`);
      process.exit(2);
  }
}

await main();
