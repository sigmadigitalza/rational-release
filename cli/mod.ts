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
 *     changelog-html      Convert a changelog to an HTML docs page.
 *     validate-title      Validate a PR title against conventional commits.
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

import { readFile, writeFile } from "node:fs/promises";
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
import { generateChangelogHtml } from "./changelog_html.ts";
import { validateTitle } from "./validate.ts";

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

  changelog-html <changelog.md> <output.html>
      Convert a Keep-a-Changelog Markdown file to an HTML docs page.

  validate-title <title> [--allowed-types feat,fix,...] [--require-scope]
      Validate a PR title against the conventional-commits spec.
      Prints a JSON verdict: { ok, reason, parsed }.
`;

async function readStdin(): Promise<string> {
  process.stdin.setEncoding("utf-8");
  let text = "";
  for await (const chunk of process.stdin) {
    text += chunk;
  }
  return text;
}

async function readSubjects(commitsFile: string | undefined): Promise<string[]> {
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
    console.error("usage: set-version <manifest> <version> [--jsonpath $.version]");
    process.exit(2);
  }
  await writeManifestVersion(manifestPath, jsonpath, version);
}

async function cmdChangelogGenerate(args: string[]): Promise<void> {
  const bootstrap = takeFlag(args, "--bootstrap");
  const [prsPath, changelogPath] = args;
  if (!prsPath || !changelogPath) {
    console.error("usage: changelog-generate <prs.json> <changelog.md> [--bootstrap]");
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
    console.error("usage: changelog-finalise <changelog.md> <version> [--date YYYY-MM-DD]");
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

async function cmdChangelogHtml(args: string[]): Promise<void> {
  const [src, dst] = args;
  if (!src || !dst) {
    console.error("usage: changelog-html <changelog.md> <output.html>");
    process.exit(2);
  }
  await generateChangelogHtml(src, dst);
}

function cmdValidateTitle(args: string[]): void {
  const allowedRaw = takeOption(args, "--allowed-types") ??
    "feat,fix,docs,style,refactor,perf,test,build,ci,chore,revert";
  const requireScope = takeFlag(args, "--require-scope");
  const [title] = args;
  if (!title) {
    console.error(
      "usage: validate-title <title> [--allowed-types feat,fix,...] [--require-scope]",
    );
    process.exit(2);
  }
  const allowed = allowedRaw.split(",").map((s) => s.trim());
  const result = validateTitle(title, allowed, requireScope);
  console.log(JSON.stringify(result));
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
    case "changelog-html":
      await cmdChangelogHtml(rest);
      return;
    case "validate-title":
      cmdValidateTitle(rest);
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
