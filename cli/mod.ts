#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * @module @sigmadigitalza/rational-release
 *
 * CLI entry point. Subcommands:
 *
 *     next-version        Compute the next semver from conventional commits.
 *     read-version        Print the current version from the manifest.
 *     set-version         Update the manifest version in place.
 *     changelog-generate  Rewrite the [Unreleased] section from merged PRs.
 *     changelog-finalise  Promote [Unreleased] to [X.Y.Z] - date.
 *     extract-section     Print the body of a single [version] section.
 *     validate-title      Validate a PR title.
 *     validate-commits    Validate commit-message headers.
 *     build-changelog     Build markdown or HTML changelog output from git history.
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
import { releaseGate } from "./release_gate.ts";
import { mirrorPairs, parsePairs } from "./mirror.ts";
import { branchVersion } from "./branch_version.ts";
import {
  type MergedPr as ReleaseTailPr,
  renderReleaseNotesTail,
} from "./release_notes_tail.ts";
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
import { detectReleaseMerge } from "./detect_release_merge.ts";
import { safeRef, supersedeStale } from "./supersede_stale.ts";
import { dispatchWorkflows, safeName } from "./dispatch_workflows.ts";
import { prevTag } from "./prev_tag.ts";
import { collectCommits } from "./collect_commits.ts";
import { collectMergedPrs, resolveSinceEpoch } from "./collect_merged_prs.ts";
import { stagePrep } from "./stage_prep.ts";
import { forcePush } from "./force_push.ts";
import { openOrUpdateReleasePr } from "./open_or_update_pr.ts";
import { computeNextVersion } from "./compute_next_version.ts";
import { readCliVersion } from "./cli_version.ts";

const USAGE = `\
rational-release <subcommand> [args...]

Subcommands:
  next-version <manifest> [--jsonpath $.version] [--pre-1.0-cap]
               [--commits-file FILE] [--patch-types LIST] [--minor-types LIST]
      Print the next semver. Reads commit subjects from --commits-file
      or stdin (one subject per line). --patch-types and --minor-types
      take a comma-separated list of additional commit types to fold
      into the patch / minor tier (e.g. --patch-types refactor,build).
      Built-in mappings (feat → minor; fix, perf → patch; ! → major)
      always win over opt-in entries.

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

  extract-section <changelog.md> <version> [--fallback STR]
      Print the body of [version] to stdout. Empty if missing — or
      the --fallback string if provided (a trailing newline is added
      if absent).

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

  branch-version --branch BRANCH --prefix PREFIX
      Strip PREFIX from BRANCH and validate the remainder as X.Y.Z.
      Prints the version to stdout. Exits non-zero if the branch does
      not match the prefix or the trailing version is not strict semver.

  release-notes-tail --prs FILE --since EPOCH --version X.Y.Z
                     [--prev-tag TAG] [--repo OWNER/REPO]
      Render the "Pull requests in this release" tail block from a gh
      pr-list JSON dump. EPOCH is the unix timestamp (\`git log -1
      --format=%ct\` of PREV_TAG). If --prev-tag and --repo are both
      set, also emits a compare link.

  mirror [--pairs-file FILE] [--from-env VAR]
      Copy files between paths described as newline-separated \`src:dst\`
      pairs. Reads from --pairs-file, then --from-env (default
      MIRROR_PATHS), then stdin. Creates the destination directory if it
      doesn't exist. Empty input is a no-op.

  release-gate --prev-tag TAG --current X.Y.Z --bumped true|false
      Decide whether prepare-release should open/update a release PR.
      Writes \`proceed=true|false\` and \`reason=...\` to GITHUB_OUTPUT
      (when set) and to stdout. Always exits 0; the workflow gates on
      the proceed value.

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

  detect-release-merge [--sha SHA] [--repo OWNER/REPO] [--prefix release/v]
      Look up merged PRs whose merge commit equals SHA and report whether
      any has a head ref starting with PREFIX. SHA / repo default to
      GITHUB_SHA / GITHUB_REPOSITORY. Writes \`skip=true|false\` and
      \`head-ref=...\` to GITHUB_OUTPUT (when set) and a skip line to
      GITHUB_STEP_SUMMARY (when a match is found). Retries transient gh
      failures; on persistent failure emits a warning and treats as "no
      match" (proceed). Used by prepare-release as a race-guard.

  supersede-stale --current BRANCH --version X.Y.Z [--prefix release/v]
                  [--base main]
      List open PRs against BASE whose head starts with PREFIX but isn't
      BRANCH, and close each with a "superseded by" comment + branch
      delete. Empty PREFIX is rejected (would close unrelated PRs).
      Writes one summary line per closed PR to GITHUB_STEP_SUMMARY; per-
      PR failures become warnings, do not abort.

  dispatch-workflows --ref REF [--workflows-file FILE] [--from-env VAR]
      Trigger each named workflow on REF via \`gh workflow run\`. Input
      list is newline-separated; whitespace is trimmed and \`# ...\`
      comment lines are skipped. Source order: --workflows-file,
      --from-env VAR (default WORKFLOWS), stdin. Failures become
      warnings, do not abort. Used by prepare-release's optional
      post-push-workflows input.

  prev-tag
      Print the most recent strict-semver \`vX.Y.Z\` tag (or empty if
      none). Filters out floating-major tags (\`v1\`) and pre-release
      suffixes. Writes \`tag=...\` to GITHUB_OUTPUT (when set) and the
      tag to stdout.

  collect-commits --prev-tag TAG --out FILE
      Run \`git log [TAG..HEAD] --format=%s\` and write subjects to
      FILE (one per line). Empty TAG walks full history (first release).

  collect-merged-prs --out FILE [--prev-tag TAG | --since EPOCH]
                     [--base BRANCH] [--limit N]
      Fetch merged PRs against BASE (default \`main\`) via
      \`gh pr list --json\`, filter to \`mergedAt > epoch\`, write the
      array to FILE as JSON. Epoch source: \`--since EPOCH\` if given,
      otherwise the committer time of \`--prev-tag\` (empty / unset
      means epoch=0, include all merged PRs — first release). Retries
      transient gh failures.

  stage-prep --manifest PATH --changelog PATH --version X.Y.Z
             [--bumped] [--mirrors STR] [--extras STR]
      Stage the prep-commit paths (manifest if --bumped, changelog
      always, mirror destinations if they exist, extras if they
      exist), then \`git commit -m "chore(release): prep vX.Y.Z"\`.
      Writes \`changed=true|false\` to GITHUB_OUTPUT depending on
      whether the staged diff was non-empty.

  force-push --refspec SPEC [--remote NAME] [--retries N]
      \`git push --force <remote> <refspec>\` with retry on transient
      failure. Throws if all attempts fail.

  open-or-update-pr --head BRANCH --version X.Y.Z --prev-version X.Y.Z
                    --unreleased-from FILE [--base BRANCH] [--body-file FILE]
      Look up an open PR with --head against --base; edit it
      (title + body) if found, else create a new one. Body is built
      from the prev → next header plus the contents of
      --unreleased-from. Writes the body to --body-file before
      invoking \`gh\`.

  compute-next-version <manifest> --commits-file FILE
                       [--jsonpath $.version] [--pre-1.0-cap]
                       [--patch-types LIST] [--minor-types LIST]
      Read the current version from the manifest + commit subjects
      from FILE, write \`current=...\`, \`next=...\`, \`bumped=true|false\`
      to GITHUB_OUTPUT (when set), and write a step-summary line
      when bumped. Equivalent to running \`read-version\` then
      \`next-version\` and wiring their outputs by hand.

  version
      Print the rational-release CLI's own version (read from the
      package's deno.json) to stdout. Useful for introspecting which
      release a workflow is pinned to.
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

function parseTypeList(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return list.length > 0 ? list : undefined;
}

async function cmdNextVersion(args: string[]): Promise<void> {
  const jsonpath = takeOption(args, "--jsonpath") ?? "$.version";
  const pre1Cap = takeFlag(args, "--pre-1.0-cap");
  const commitsFile = takeOption(args, "--commits-file");
  const patchTypes = parseTypeList(takeOption(args, "--patch-types"));
  const minorTypes = parseTypeList(takeOption(args, "--minor-types"));
  const [manifestPath] = args;
  if (!manifestPath) {
    console.error("usage: next-version <manifest> [...]");
    process.exit(2);
  }
  const current = await readManifestVersion(manifestPath, jsonpath);
  const subjects = await readSubjects(commitsFile);
  const bump = highestBump(subjects, { patchTypes, minorTypes });
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
  const fallback = takeOption(args, "--fallback");
  const [changelogPath, version] = args;
  if (!changelogPath || !version) {
    console.error(
      "usage: extract-section <changelog.md> <version> [--fallback STR]",
    );
    process.exit(2);
  }
  const changelog = await readFile(changelogPath, "utf-8");
  const body = extractSection(changelog, version);
  if (body.trim() === "" && fallback != null) {
    process.stdout.write(fallback.endsWith("\n") ? fallback : `${fallback}\n`);
  } else {
    process.stdout.write(body);
  }
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

function cmdBranchVersion(args: string[]): void {
  const branch = takeOption(args, "--branch");
  const prefix = takeOption(args, "--prefix");
  if (!branch || !prefix) {
    console.error(
      "usage: branch-version --branch BRANCH --prefix PREFIX",
    );
    process.exit(2);
  }
  try {
    console.log(branchVersion(branch, prefix));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`::error::${message}`);
    process.exit(1);
  }
}

async function cmdReleaseNotesTail(args: string[]): Promise<void> {
  const prsPath = takeOption(args, "--prs");
  const sinceRaw = takeOption(args, "--since");
  const version = takeOption(args, "--version");
  const prevTag = takeOption(args, "--prev-tag") ?? "";
  const repo = takeOption(args, "--repo") ?? "";
  if (!prsPath || sinceRaw == null || !version) {
    console.error(
      "usage: release-notes-tail --prs FILE --since EPOCH --version X.Y.Z [--prev-tag TAG] [--repo OWNER/REPO]",
    );
    process.exit(2);
  }
  const sinceEpoch = Number(sinceRaw);
  if (!Number.isFinite(sinceEpoch) || sinceEpoch < 0) {
    console.error(`--since must be a non-negative integer, got "${sinceRaw}"`);
    process.exit(2);
  }
  // Strict X.Y.Z, with an optional leading "v" stripped. The compare URL
  // is built as `vX.Y.Z`, so `v1.2.3` would otherwise produce `vv1.2.3`.
  const normalisedVersion = version.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+$/.test(normalisedVersion)) {
    console.error(
      `--version must be X.Y.Z (e.g. 1.2.3), got "${version}"`,
    );
    process.exit(2);
  }
  const raw = JSON.parse(await readFile(prsPath, "utf-8"));
  if (!Array.isArray(raw)) {
    console.error(`${prsPath}: expected a JSON array`);
    process.exit(2);
  }
  const prs = raw as ReleaseTailPr[];
  process.stdout.write(
    renderReleaseNotesTail({
      prs,
      sinceEpoch,
      prevTag: prevTag || null,
      version: normalisedVersion,
      repo: repo || null,
    }),
  );
}

async function cmdMirror(args: string[]): Promise<void> {
  const pairsFile = takeOption(args, "--pairs-file");
  const fromEnv = takeOption(args, "--from-env") ?? "MIRROR_PATHS";
  let text: string;
  if (pairsFile) {
    text = await readFile(pairsFile, "utf-8");
  } else if (process.env[fromEnv]) {
    text = process.env[fromEnv]!;
  } else if (!process.stdin.isTTY) {
    text = await readStdin();
  } else {
    text = "";
  }
  try {
    const pairs = parsePairs(text);
    if (pairs.length === 0) return;
    await mirrorPairs(pairs);
    for (const { src, dst } of pairs) {
      console.log(`Mirrored ${src} → ${dst}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`::error::${message}`);
    process.exit(1);
  }
}

async function cmdReleaseGate(args: string[]): Promise<void> {
  const prevTag = takeOption(args, "--prev-tag") ?? "";
  const current = takeOption(args, "--current");
  const bumpedRaw = takeOption(args, "--bumped");
  if (!current || bumpedRaw == null) {
    console.error(
      "usage: release-gate --prev-tag TAG --current X.Y.Z --bumped true|false",
    );
    process.exit(2);
  }
  if (bumpedRaw !== "true" && bumpedRaw !== "false") {
    console.error(`--bumped must be "true" or "false", got "${bumpedRaw}"`);
    process.exit(2);
  }
  // Defense in depth: releaseGate() is designed to never throw, but if a
  // future regression slips through we still want a clean `proceed=false`
  // rather than a stack trace that crashes the workflow step.
  let verdict;
  try {
    verdict = releaseGate(prevTag, current, bumpedRaw === "true");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    verdict = { proceed: false, reason: `release-gate error: ${message}` };
  }
  const output = process.env.GITHUB_OUTPUT;
  const line = `proceed=${verdict.proceed}\nreason=${verdict.reason}\n`;
  if (output) await appendFile(output, line);
  process.stdout.write(line);
  if (!verdict.proceed) {
    console.error(`::notice::Skipping release: ${verdict.reason}`);
  }
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
    case "branch-version":
      cmdBranchVersion(rest);
      return;
    case "release-notes-tail":
      await cmdReleaseNotesTail(rest);
      return;
    case "mirror":
      await cmdMirror(rest);
      return;
    case "release-gate":
      await cmdReleaseGate(rest);
      return;
    case "build-changelog":
      await cmdBuildChangelog(rest);
      return;
    case "detect-release-merge":
      await cmdDetectReleaseMerge(rest);
      return;
    case "supersede-stale":
      await cmdSupersedeStale(rest);
      return;
    case "dispatch-workflows":
      await cmdDispatchWorkflows(rest);
      return;
    case "prev-tag":
      await cmdPrevTag(rest);
      return;
    case "collect-commits":
      await cmdCollectCommits(rest);
      return;
    case "collect-merged-prs":
      await cmdCollectMergedPrs(rest);
      return;
    case "stage-prep":
      await cmdStagePrep(rest);
      return;
    case "force-push":
      await cmdForcePush(rest);
      return;
    case "open-or-update-pr":
      await cmdOpenOrUpdatePr(rest);
      return;
    case "compute-next-version":
      await cmdComputeNextVersion(rest);
      return;
    case "version":
      await cmdVersion(rest);
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

async function cmdDetectReleaseMerge(args: string[]): Promise<void> {
  const sha = takeOption(args, "--sha") ?? process.env.GITHUB_SHA ?? "";
  const repo = takeOption(args, "--repo") ??
    process.env.GITHUB_REPOSITORY ?? "";
  const prefix = takeOption(args, "--prefix") ?? "release/v";
  if (!sha || !repo) {
    console.error(
      "detect-release-merge: --sha + --repo (or GITHUB_SHA + GITHUB_REPOSITORY env) required",
    );
    process.exit(2);
  }
  const result = await detectReleaseMerge({ sha, repo, prefix });
  for (const w of result.warnings) console.warn(`::warning::${w}`);

  const output = `skip=${result.headRef !== null}\nhead-ref=${
    result.headRef ?? ""
  }\n`;
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, output);
  } else {
    process.stdout.write(output);
  }
  if (result.headRef !== null) {
    // stderr, not stdout — the machine-parseable key=value output
    // above is on stdout and must not interleave with human text.
    console.error(
      `Triggering commit is the merge of ${result.headRef} — cut-release will handle this. Skipping prepare-release.`,
    );
    await appendStepSummary(
      `### ⏭️ Skipped: triggering commit is a release-merge (\`${
        result.headRef.replaceAll("`", "")
      }\`)\n`,
    );
  }
}

async function cmdSupersedeStale(args: string[]): Promise<void> {
  const prefix = takeOption(args, "--prefix") ?? "release/v";
  const currentBranch = takeOption(args, "--current");
  const version = takeOption(args, "--version");
  const base = takeOption(args, "--base") ?? process.env.GITHUB_REF_NAME ??
    "main";
  if (!currentBranch || !version) {
    console.error("supersede-stale: --current + --version required");
    process.exit(2);
  }
  const result = await supersedeStale({
    prefix,
    currentBranch,
    version,
    base,
  });
  if (result.skipped) {
    console.warn(
      "::warning::release-branch-prefix is empty; skipping stale PR sweep to avoid closing unrelated PRs",
    );
    return;
  }
  for (const pr of result.closed) {
    console.log(
      `Superseded stale release PR #${pr.number} (head=${pr.headRefName}) by v${version}`,
    );
    await appendStepSummary(
      `### 🧹 Superseded stale release PR #${pr.number} (was \`${
        safeRef(pr.headRefName)
      }\`)\n`,
    );
  }
  for (const pr of result.failed) {
    console.warn(
      `::warning::failed to close stale PR #${pr.number} (head=${pr.headRefName}); leaving for manual cleanup`,
    );
  }
}

async function cmdPrevTag(_args: string[]): Promise<void> {
  const result = await prevTag();
  const tag = result.tag ?? "";
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
  }
  if (tag) {
    process.stdout.write(`${tag}\n`);
    console.error(`Previous release: ${tag}`);
  } else {
    console.error("No previous release tag — this will be the first.");
  }
}

async function cmdCollectCommits(args: string[]): Promise<void> {
  const prev = takeOption(args, "--prev-tag") ?? "";
  const outFile = takeOption(args, "--out");
  if (!outFile) {
    console.error("collect-commits: --out FILE required");
    process.exit(2);
  }
  const res = await collectCommits({ prevTag: prev, outFile });
  console.error(`Found ${res.count} commit subject(s).`);
}

async function cmdCollectMergedPrs(args: string[]): Promise<void> {
  const prevTag = takeOption(args, "--prev-tag") ?? "";
  const sinceRaw = takeOption(args, "--since");
  const outFile = takeOption(args, "--out");
  const base = takeOption(args, "--base") ?? process.env.GITHUB_REF_NAME ??
    "main";
  const limit = Number(takeOption(args, "--limit") ?? "200");
  if (!outFile) {
    console.error("collect-merged-prs: --out FILE required");
    process.exit(2);
  }
  let since: number;
  if (sinceRaw != null) {
    since = Number(sinceRaw);
    if (!Number.isFinite(since)) {
      console.error(
        `collect-merged-prs: --since must be a number, got ${sinceRaw}`,
      );
      process.exit(2);
    }
  } else {
    since = await resolveSinceEpoch(prevTag || null);
  }
  const res = await collectMergedPrs({
    sinceEpoch: since,
    outFile,
    base,
    limit,
  });
  for (const w of res.warnings) console.warn(`::warning::${w}`);
  console.error(`Collected ${res.count} merged PR(s).`);
}

async function cmdStagePrep(args: string[]): Promise<void> {
  const manifest = takeOption(args, "--manifest");
  const changelog = takeOption(args, "--changelog");
  const version = takeOption(args, "--version");
  const bumped = takeFlag(args, "--bumped");
  const mirrors = takeOption(args, "--mirrors") ?? "";
  const extras = takeOption(args, "--extras") ?? "";
  if (!manifest || !changelog || !version) {
    console.error(
      "stage-prep: --manifest, --changelog, and --version required",
    );
    process.exit(2);
  }
  const res = await stagePrep({
    manifest,
    bumped,
    changelog,
    mirrors,
    extras,
    version,
  });
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `changed=${res.changed}\n`,
    );
  }
  console.error(`Staged ${res.staged.length} path(s); changed=${res.changed}`);
}

async function cmdForcePush(args: string[]): Promise<void> {
  const refspec = takeOption(args, "--refspec");
  const remote = takeOption(args, "--remote") ?? "origin";
  const retriesRaw = takeOption(args, "--retries");
  const retries = retriesRaw ? Number(retriesRaw) : undefined;
  if (!refspec) {
    console.error("force-push: --refspec required");
    process.exit(2);
  }
  const res = await forcePush({ refspec, remote, retries });
  for (const w of res.warnings) console.warn(`::warning::${w}`);
}

async function cmdComputeNextVersion(args: string[]): Promise<void> {
  const commitsFile = takeOption(args, "--commits-file");
  const jsonPath = takeOption(args, "--jsonpath") ?? "$.version";
  const pre1Cap = takeFlag(args, "--pre-1.0-cap");
  const patchTypes = parseTypeList(takeOption(args, "--patch-types"));
  const minorTypes = parseTypeList(takeOption(args, "--minor-types"));
  const [manifestPath] = args;
  if (!manifestPath || !commitsFile) {
    console.error(
      "compute-next-version: <manifest> + --commits-file FILE required",
    );
    process.exit(2);
  }
  const res = await computeNextVersion({
    manifestPath,
    commitsFile,
    jsonPath,
    pre1Cap,
    patchTypes,
    minorTypes,
  });
  const output =
    `current=${res.current}\nnext=${res.next}\nbumped=${res.bumped}\n`;
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, output);
  } else {
    process.stdout.write(output);
  }
  if (res.bumped) {
    await appendStepSummary(
      `### 📦 Version bump: \`${res.current}\` → \`${res.next}\`\n`,
    );
  }
}

async function cmdVersion(_args: string[]): Promise<void> {
  const version = await readCliVersion();
  console.log(version);
}

async function cmdOpenOrUpdatePr(args: string[]): Promise<void> {
  const head = takeOption(args, "--head");
  const version = takeOption(args, "--version");
  const prevVersion = takeOption(args, "--prev-version") ?? "";
  const unreleasedFrom = takeOption(args, "--unreleased-from");
  const base = takeOption(args, "--base") ?? process.env.GITHUB_REF_NAME ??
    "main";
  const bodyFile = takeOption(args, "--body-file") ?? "body.md";
  if (!head || !version || !unreleasedFrom) {
    console.error(
      "open-or-update-pr: --head, --version, --unreleased-from required",
    );
    process.exit(2);
  }
  const unreleased = await readFile(unreleasedFrom, "utf-8");
  const res = await openOrUpdateReleasePr({
    head,
    version,
    prevVersion,
    unreleased,
    base,
    bodyFile,
  });
  if (res.action === "updated") {
    await appendStepSummary(
      `### 🔄 Updated release PR #${res.number}\n`,
    );
  } else {
    await appendStepSummary(
      `### 🆕 Opened release PR for v${version}\n`,
    );
  }
}

async function cmdDispatchWorkflows(args: string[]): Promise<void> {
  const ref = takeOption(args, "--ref");
  const workflowsFile = takeOption(args, "--workflows-file");
  const fromEnv = takeOption(args, "--from-env") ?? "WORKFLOWS";
  if (!ref) {
    console.error("dispatch-workflows: --ref required");
    process.exit(2);
  }
  let workflows: string;
  if (workflowsFile) {
    workflows = await readFile(workflowsFile, "utf-8");
  } else if (process.env[fromEnv]) {
    workflows = process.env[fromEnv]!;
  } else if (!process.stdin.isTTY) {
    workflows = await readStdin();
  } else {
    workflows = "";
  }
  const result = await dispatchWorkflows({ workflows, ref });
  for (const wf of result.dispatched) {
    console.log(`Dispatched workflow: ${wf.name} on ${ref}`);
    await appendStepSummary(
      `### 🚀 Dispatched \`${safeName(wf.name)}\` on \`${
        ref.replaceAll("`", "")
      }\`\n`,
    );
  }
  for (const wf of result.failed) {
    console.warn(
      `::warning::failed to dispatch ${wf.name} on ${ref}; status check will be missing on the release PR`,
    );
  }
}

if (import.meta.main) {
  await main();
}
