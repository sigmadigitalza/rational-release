import { deepStrictEqual as eq, rejects } from "node:assert/strict";
import { collectMergedPrs, filterSince } from "./collect_merged_prs.ts";
import type { GhRunner } from "./gh.ts";

const noSleep = () => Promise.resolve();
const noWrite = () => Promise.resolve();

const ok = (stdout: string): GhRunner => () =>
  Promise.resolve({ ok: true, stdout, stderr: "" });

const flaky = (failures: number, thenStdout: string): GhRunner => {
  let n = 0;
  return () => {
    n += 1;
    if (n <= failures) {
      return Promise.resolve({ ok: false, stdout: "", stderr: "transient" });
    }
    return Promise.resolve({ ok: true, stdout: thenStdout, stderr: "" });
  };
};

// Helper to build a PR row with a specific epoch.
const pr = (number: number, epoch: number, title = "feat: x") => ({
  number,
  title,
  mergedAt: new Date(epoch * 1000).toISOString(),
  author: { login: "alice" },
});

Deno.test("filterSince: keeps PRs merged strictly AFTER the given epoch", () => {
  const prs = [pr(1, 1000), pr(2, 2000), pr(3, 3000)];
  eq(filterSince(prs, 1500).map((p) => p.number), [2, 3]);
});

Deno.test("filterSince: strict > excludes exactly-equal epoch", () => {
  const prs = [pr(1, 2000), pr(2, 2001)];
  eq(filterSince(prs, 2000).map((p) => p.number), [2]);
});

Deno.test("filterSince: empty input → empty", () => {
  eq(filterSince([], 0), []);
});

Deno.test("filterSince: drops PRs with missing mergedAt", () => {
  const prs = [
    { number: 1, title: "x", mergedAt: "" },
    pr(2, 5000),
  ];
  eq(filterSince(prs, 0).map((p) => p.number), [2]);
});

Deno.test("collectMergedPrs: writes filtered array as JSON", async () => {
  let written = "";
  const writer = (_p: string, c: string) => {
    written = c;
    return Promise.resolve();
  };
  const prs = [pr(1, 1000), pr(2, 2000), pr(3, 3000)];
  const res = await collectMergedPrs({
    sinceEpoch: 1500,
    outFile: "/tmp/prs.json",
    ghRunner: ok(JSON.stringify(prs)),
    sleep: noSleep,
    writer,
  });
  eq(res.count, 2);
  const parsed = JSON.parse(written);
  eq(parsed.map((p: { number: number }) => p.number), [2, 3]);
});

Deno.test("collectMergedPrs: retries transient gh failures", async () => {
  const res = await collectMergedPrs({
    sinceEpoch: 0,
    outFile: "/tmp/x",
    ghRunner: flaky(2, JSON.stringify([pr(1, 5000)])),
    sleep: noSleep,
    writer: noWrite,
    retries: 3,
  });
  eq(res.count, 1);
  eq(res.warnings.length, 2);
});

Deno.test("collectMergedPrs: throws after exhausting retries, includes last stderr", async () => {
  const fail: GhRunner = () =>
    Promise.resolve({
      ok: false,
      stdout: "",
      stderr: "API rate-limit exceeded",
    });
  await rejects(
    () =>
      collectMergedPrs({
        sinceEpoch: 0,
        outFile: "/tmp/x",
        ghRunner: fail,
        sleep: noSleep,
        writer: noWrite,
        retries: 3,
      }),
    /gh pr list failed after 3 attempts: API rate-limit exceeded/,
  );
});

Deno.test("collectMergedPrs: respects custom base + limit", async () => {
  let captured: readonly string[] = [];
  const gh: GhRunner = (args) => {
    captured = args;
    return Promise.resolve({ ok: true, stdout: "[]", stderr: "" });
  };
  await collectMergedPrs({
    sinceEpoch: 0,
    outFile: "/tmp/x",
    base: "trunk",
    limit: 50,
    ghRunner: gh,
    sleep: noSleep,
    writer: noWrite,
  });
  eq(captured.includes("trunk"), true);
  eq(captured.includes("50"), true);
});

Deno.test("collectMergedPrs: empty / whitespace stdout parses as empty array", async () => {
  const res = await collectMergedPrs({
    sinceEpoch: 0,
    outFile: "/tmp/x",
    ghRunner: ok("   \n  "),
    sleep: noSleep,
    writer: noWrite,
  });
  eq(res.count, 0);
});
