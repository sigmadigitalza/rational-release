import { deepStrictEqual as eq, rejects } from "node:assert/strict";
import { collectCommits } from "./collect_commits.ts";
import type { GitRunner } from "./git.ts";

const ok = (stdout: string): GitRunner => () =>
  Promise.resolve({ ok: true, stdout, stderr: "" });

Deno.test("collectCommits: uses <tag>..HEAD when prevTag set", async () => {
  let captured: readonly string[] = [];
  const git: GitRunner = (args) => {
    captured = args;
    return Promise.resolve({
      ok: true,
      stdout: "feat: a\nfix: b\n",
      stderr: "",
    });
  };
  let written = "";
  const writer = (_p: string, c: string) => {
    written = c;
    return Promise.resolve();
  };
  const res = await collectCommits({
    prevTag: "v1.6.1",
    outFile: "/tmp/commits.txt",
    gitRunner: git,
    writer,
  });
  eq(captured, ["log", "v1.6.1..HEAD", "--format=%s"]);
  eq(res.range, "v1.6.1..HEAD");
  eq(res.count, 2);
  eq(written, "feat: a\nfix: b\n");
});

Deno.test("collectCommits: empty prevTag walks full history", async () => {
  let captured: readonly string[] = [];
  const git: GitRunner = (args) => {
    captured = args;
    return Promise.resolve({ ok: true, stdout: "first commit", stderr: "" });
  };
  const res = await collectCommits({
    prevTag: null,
    outFile: "/tmp/x",
    gitRunner: git,
    writer: () => Promise.resolve(),
  });
  eq(captured, ["log", "--format=%s"]);
  eq(res.range, "");
  eq(res.count, 1);
});

Deno.test("collectCommits: empty-string prevTag also walks full history", async () => {
  let captured: readonly string[] = [];
  const git: GitRunner = (args) => {
    captured = args;
    return Promise.resolve({ ok: true, stdout: "", stderr: "" });
  };
  const res = await collectCommits({
    prevTag: "",
    outFile: "/tmp/x",
    gitRunner: git,
    writer: () => Promise.resolve(),
  });
  eq(captured, ["log", "--format=%s"]);
  eq(res.count, 0);
});

Deno.test("collectCommits: counts non-blank lines only", async () => {
  const res = await collectCommits({
    prevTag: "v1.0.0",
    outFile: "/tmp/x",
    gitRunner: ok("feat: a\nfix: b\n\nperf: c\n"),
    writer: () => Promise.resolve(),
  });
  eq(res.count, 3);
});

Deno.test("collectCommits: empty output → count 0", async () => {
  const res = await collectCommits({
    prevTag: "v1.0.0",
    outFile: "/tmp/x",
    gitRunner: ok(""),
    writer: () => Promise.resolve(),
  });
  eq(res.count, 0);
});

Deno.test("collectCommits: throws on git failure", async () => {
  const fail: GitRunner = () =>
    Promise.resolve({ ok: false, stdout: "", stderr: "bad range" });
  await rejects(
    () =>
      collectCommits({
        prevTag: "v1.0.0",
        outFile: "/tmp/x",
        gitRunner: fail,
        writer: () => Promise.resolve(),
      }),
    /git log failed: bad range/,
  );
});
