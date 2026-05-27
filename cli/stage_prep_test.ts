import { deepStrictEqual as eq, rejects } from "node:assert/strict";
import {
  mirrorDestinations,
  parseExtraPaths,
  stagePrep,
} from "./stage_prep.ts";
import type { GitRunner } from "./git.ts";

Deno.test("mirrorDestinations: extracts dst from src:dst pairs", () => {
  eq(
    mirrorDestinations(
      "CHANGELOG.md:docs/changelog.md\nREADME.md:docs/README.md",
    ),
    ["docs/changelog.md", "docs/README.md"],
  );
});

Deno.test("mirrorDestinations: skips blank lines + lines without `:`", () => {
  eq(mirrorDestinations("\nfoo\n\nCHANGELOG.md:docs/x.md"), ["docs/x.md"]);
});

Deno.test("mirrorDestinations: trims whitespace", () => {
  eq(mirrorDestinations("  a:b  \n  c:d  "), ["b", "d"]);
});

Deno.test("mirrorDestinations: skips lines with empty dst", () => {
  eq(mirrorDestinations("src:\nfoo:bar"), ["bar"]);
});

Deno.test("parseExtraPaths: trims + skips blanks + skips comments", () => {
  eq(
    parseExtraPaths(
      "  ui/search-index.json  \n\n# comment\ndist/openapi.json\n",
    ),
    ["ui/search-index.json", "dist/openapi.json"],
  );
});

// Build a recording GitRunner that returns a configured response per command.
const buildGit = (
  responses: Record<string, { ok: boolean; stdout?: string; stderr?: string }>,
  calls: (readonly string[])[],
): GitRunner =>
(args) => {
  calls.push(args);
  const key = args[0];
  const r = responses[key] ??
    responses["*"] ?? { ok: true, stdout: "", stderr: "" };
  return Promise.resolve({
    ok: r.ok,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  });
};

Deno.test("stagePrep: stages manifest when bumped, plus changelog, returns changed=true", async () => {
  const calls: (readonly string[])[] = [];
  const git = buildGit(
    {
      diff: { ok: false }, // diff --cached --quiet exits non-zero → there are staged changes
      "*": { ok: true },
    },
    calls,
  );
  const res = await stagePrep({
    manifest: "deno.json",
    bumped: true,
    changelog: "CHANGELOG.md",
    mirrors: "",
    extras: "",
    version: "1.7.0",
    gitRunner: git,
    pathExists: () => true,
  });
  eq(res.changed, true);
  eq(res.staged, ["deno.json", "CHANGELOG.md"]);
  // First two should be git add ...; then git diff --cached --quiet; then git commit
  eq(calls[0], ["add", "deno.json"]);
  eq(calls[1], ["add", "CHANGELOG.md"]);
  eq(calls[2], ["diff", "--cached", "--quiet"]);
  eq(calls[3][0], "commit");
  eq(calls[3][2], "chore(release): prep v1.7.0");
});

Deno.test("stagePrep: skips manifest when bumped=false", async () => {
  const calls: (readonly string[])[] = [];
  const git = buildGit({ diff: { ok: false }, "*": { ok: true } }, calls);
  const res = await stagePrep({
    manifest: "deno.json",
    bumped: false,
    changelog: "CHANGELOG.md",
    mirrors: "",
    extras: "",
    version: "1.7.0",
    gitRunner: git,
    pathExists: () => true,
  });
  eq(res.staged, ["CHANGELOG.md"]);
});

Deno.test("stagePrep: stages mirror destinations that exist", async () => {
  const calls: (readonly string[])[] = [];
  const git = buildGit({ diff: { ok: false }, "*": { ok: true } }, calls);
  const exists = (p: string) => p === "docs/changelog.md"; // only this one exists
  const res = await stagePrep({
    manifest: "deno.json",
    bumped: true,
    changelog: "CHANGELOG.md",
    mirrors: "CHANGELOG.md:docs/changelog.md\nREADME.md:docs/missing.md",
    extras: "",
    version: "1.7.0",
    gitRunner: git,
    pathExists: exists,
  });
  eq(res.staged, ["deno.json", "CHANGELOG.md", "docs/changelog.md"]);
});

Deno.test("stagePrep: stages extras that exist + skips missing", async () => {
  const calls: (readonly string[])[] = [];
  const git = buildGit({ diff: { ok: false }, "*": { ok: true } }, calls);
  const exists = (p: string) => p !== "missing.txt";
  const res = await stagePrep({
    manifest: "deno.json",
    bumped: false,
    changelog: "CHANGELOG.md",
    mirrors: "",
    extras: "ui/search-index.json\nmissing.txt\n",
    version: "1.7.0",
    gitRunner: git,
    pathExists: exists,
  });
  eq(res.staged, ["CHANGELOG.md", "ui/search-index.json"]);
});

Deno.test("stagePrep: changed=false when diff --cached --quiet exits 0 (no staged diff)", async () => {
  const calls: (readonly string[])[] = [];
  // diff returns ok:true → no staged changes; no commit should happen.
  const git = buildGit({ diff: { ok: true }, "*": { ok: true } }, calls);
  const res = await stagePrep({
    manifest: "deno.json",
    bumped: true,
    changelog: "CHANGELOG.md",
    mirrors: "",
    extras: "",
    version: "1.7.0",
    gitRunner: git,
    pathExists: () => true,
  });
  eq(res.changed, false);
  // Verify no commit call was made.
  const commitCall = calls.find((c) => c[0] === "commit");
  eq(commitCall, undefined);
});

Deno.test("stagePrep: throws on git add failure", async () => {
  const calls: (readonly string[])[] = [];
  const git = buildGit({ add: { ok: false, stderr: "no such file" } }, calls);
  await rejects(
    () =>
      stagePrep({
        manifest: "missing.json",
        bumped: true,
        changelog: "CHANGELOG.md",
        mirrors: "",
        extras: "",
        version: "1.7.0",
        gitRunner: git,
        pathExists: () => true,
      }),
    /git add missing.json failed: no such file/,
  );
});

Deno.test("stagePrep: throws on git commit failure", async () => {
  const git: GitRunner = (args) => {
    if (args[0] === "diff") {
      return Promise.resolve({ ok: false, stdout: "", stderr: "" });
    }
    if (args[0] === "commit") {
      return Promise.resolve({ ok: false, stdout: "", stderr: "no identity" });
    }
    return Promise.resolve({ ok: true, stdout: "", stderr: "" });
  };
  await rejects(
    () =>
      stagePrep({
        manifest: "deno.json",
        bumped: true,
        changelog: "CHANGELOG.md",
        mirrors: "",
        extras: "",
        version: "1.7.0",
        gitRunner: git,
        pathExists: () => true,
      }),
    /git commit failed: no identity/,
  );
});
