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

import { highestBump } from "./conventional.ts";
import { nextVersion } from "./version.ts";
import { readManifestVersion, writeManifestVersion } from "./manifest.ts";
import {
  bucketPrs,
  extractSection,
  finaliseUnreleased,
  renderUnreleased,
  rewriteUnreleased,
} from "./changelog.ts";

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

  changelog-generate <prs.json> <changelog.md>
      Rewrite the [Unreleased] section in place from merged PRs.

  changelog-finalise <changelog.md> <version> [--date YYYY-MM-DD]
      Promote [Unreleased] to [version] - date and prepend a fresh empty
      [Unreleased] block. Date defaults to today (UTC).

  extract-section <changelog.md> <version>
      Print the body of [version] to stdout. Empty if missing.
`;

async function readSubjects(commitsFile: string | undefined): Promise<string[]> {
  let text: string;
  if (commitsFile) {
    text = await Deno.readTextFile(commitsFile);
  } else {
    const buf = new Uint8Array(64 * 1024);
    const chunks: Uint8Array[] = [];
    let n: number | null;
    while ((n = await Deno.stdin.read(buf)) !== null) {
      chunks.push(buf.slice(0, n));
    }
    text = new TextDecoder().decode(
      new Uint8Array(
        chunks.reduce<number[]>((acc, c) => acc.concat([...c]), []),
      ),
    );
  }
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
    Deno.exit(2);
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
    Deno.exit(2);
  }
  console.log(await readManifestVersion(manifestPath, jsonpath));
}

async function cmdSetVersion(args: string[]): Promise<void> {
  const jsonpath = takeOption(args, "--jsonpath") ?? "$.version";
  const [manifestPath, version] = args;
  if (!manifestPath || !version) {
    console.error("usage: set-version <manifest> <version> [--jsonpath $.version]");
    Deno.exit(2);
  }
  await writeManifestVersion(manifestPath, jsonpath, version);
}

async function cmdChangelogGenerate(args: string[]): Promise<void> {
  const [prsPath, changelogPath] = args;
  if (!prsPath || !changelogPath) {
    console.error("usage: changelog-generate <prs.json> <changelog.md>");
    Deno.exit(2);
  }
  const prs = JSON.parse(await Deno.readTextFile(prsPath));
  const changelog = await Deno.readTextFile(changelogPath);
  const buckets = bucketPrs(prs);
  const body = renderUnreleased(buckets);
  const updated = rewriteUnreleased(changelog, body);
  await Deno.writeTextFile(changelogPath, updated);
}

async function cmdChangelogFinalise(args: string[]): Promise<void> {
  const date = takeOption(args, "--date") ??
    new Date().toISOString().slice(0, 10);
  const [changelogPath, version] = args;
  if (!changelogPath || !version) {
    console.error("usage: changelog-finalise <changelog.md> <version> [--date YYYY-MM-DD]");
    Deno.exit(2);
  }
  const changelog = await Deno.readTextFile(changelogPath);
  const updated = finaliseUnreleased(changelog, version, date);
  await Deno.writeTextFile(changelogPath, updated);
}

async function cmdExtractSection(args: string[]): Promise<void> {
  const [changelogPath, version] = args;
  if (!changelogPath || !version) {
    console.error("usage: extract-section <changelog.md> <version>");
    Deno.exit(2);
  }
  const changelog = await Deno.readTextFile(changelogPath);
  const body = extractSection(changelog, version);
  await Deno.stdout.write(new TextEncoder().encode(body));
}

async function main(): Promise<void> {
  const [sub, ...rest] = Deno.args;
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
    case "--help":
    case "-h":
    case undefined:
      console.log(USAGE);
      return;
    default:
      console.error(`Unknown subcommand: ${sub}\n\n${USAGE}`);
      Deno.exit(2);
  }
}

if (import.meta.main) {
  await main();
}
