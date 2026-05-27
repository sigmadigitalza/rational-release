import { deepStrictEqual as eq } from "node:assert/strict";
import { detectReleaseMerge } from "./detect_release_merge.ts";
import type { GhRunner } from "./gh.ts";

const noSleep = () => Promise.resolve();

const ok = (stdout: string): GhRunner => () =>
  Promise.resolve({ ok: true, stdout, stderr: "" });

const fail: GhRunner = () =>
  Promise.resolve({ ok: false, stdout: "", stderr: "boom" });

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

Deno.test("detectReleaseMerge: returns first matching release ref", async () => {
  const res = await detectReleaseMerge({
    sha: "abc",
    repo: "o/r",
    ghRunner: ok("release/v1.2.3"),
    sleep: noSleep,
  });
  eq(res, { headRef: "release/v1.2.3", warnings: [] });
});

Deno.test("detectReleaseMerge: skips non-matching refs, picks first match", async () => {
  const res = await detectReleaseMerge({
    sha: "abc",
    repo: "o/r",
    ghRunner: ok("feature/foo\nrelease/v1.2.3\nrelease/v9.9.9"),
    sleep: noSleep,
  });
  eq(res.headRef, "release/v1.2.3");
});

Deno.test("detectReleaseMerge: null when no matching ref", async () => {
  const res = await detectReleaseMerge({
    sha: "abc",
    repo: "o/r",
    ghRunner: ok("main\nfeature/foo"),
    sleep: noSleep,
  });
  eq(res, { headRef: null, warnings: [] });
});

Deno.test("detectReleaseMerge: null on empty gh output", async () => {
  const res = await detectReleaseMerge({
    sha: "abc",
    repo: "o/r",
    ghRunner: ok(""),
    sleep: noSleep,
  });
  eq(res, { headRef: null, warnings: [] });
});

Deno.test("detectReleaseMerge: trims whitespace around refs", async () => {
  const res = await detectReleaseMerge({
    sha: "abc",
    repo: "o/r",
    ghRunner: ok("  release/v1.2.3  "),
    sleep: noSleep,
  });
  eq(res.headRef, "release/v1.2.3");
});

Deno.test("detectReleaseMerge: retries transient failures then succeeds", async () => {
  const res = await detectReleaseMerge({
    sha: "abc",
    repo: "o/r",
    ghRunner: flaky(2, "release/v1.2.3"),
    sleep: noSleep,
    retries: 3,
  });
  eq(res.headRef, "release/v1.2.3");
  eq(res.warnings.length, 2);
});

Deno.test("detectReleaseMerge: persistent failure returns null with guard-inactive warning", async () => {
  const res = await detectReleaseMerge({
    sha: "abc",
    repo: "o/r",
    ghRunner: fail,
    sleep: noSleep,
    retries: 3,
  });
  eq(res.headRef, null);
  eq(res.warnings.length, 3);
  eq(
    res.warnings[2].includes("guard inactive"),
    true,
  );
});

Deno.test("detectReleaseMerge: custom prefix", async () => {
  const res = await detectReleaseMerge({
    sha: "abc",
    repo: "o/r",
    prefix: "rel-",
    ghRunner: ok("release/v1.2.3\nrel-1.2.3"),
    sleep: noSleep,
  });
  eq(res.headRef, "rel-1.2.3");
});

Deno.test("detectReleaseMerge: passes correct endpoint + jq to gh", async () => {
  let captured: readonly string[] = [];
  const capture: GhRunner = (args) => {
    captured = args;
    return Promise.resolve({ ok: true, stdout: "", stderr: "" });
  };
  await detectReleaseMerge({
    sha: "deadbeef",
    repo: "owner/repo",
    ghRunner: capture,
    sleep: noSleep,
  });
  eq(captured[0], "api");
  eq(captured[1], "repos/owner/repo/commits/deadbeef/pulls");
  eq(captured[2], "--jq");
  eq(
    captured[3],
    ".[] | select(.merged_at != null) | .head.ref",
  );
});
