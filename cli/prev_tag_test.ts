import { deepStrictEqual as eq, rejects } from "node:assert/strict";
import { pickStrictSemverTags, prevTag } from "./prev_tag.ts";
import type { GitRunner } from "./git.ts";

const ok = (stdout: string): GitRunner => () =>
  Promise.resolve({ ok: true, stdout, stderr: "" });

Deno.test("pickStrictSemverTags: keeps vX.Y.Z", () => {
  eq(
    pickStrictSemverTags(["v1.2.3", "v0.0.1", "v10.20.30"]),
    ["v1.2.3", "v0.0.1", "v10.20.30"],
  );
});

Deno.test("pickStrictSemverTags: drops floating major / minor tags", () => {
  eq(pickStrictSemverTags(["v1", "v1.2", "v1.2.3"]), ["v1.2.3"]);
});

Deno.test("pickStrictSemverTags: drops pre-release / build metadata", () => {
  eq(
    pickStrictSemverTags(["v1.2.3-rc1", "v1.2.3+build", "v1.2.3"]),
    ["v1.2.3"],
  );
});

Deno.test("pickStrictSemverTags: drops non-v-prefixed", () => {
  eq(pickStrictSemverTags(["1.2.3", "release-1.2.3"]), []);
});

Deno.test("prevTag: returns the first tag from -v:refname-sorted output", async () => {
  const res = await prevTag({
    gitRunner: ok("v1.7.0\nv1.6.1\nv1.6.0\nv1.5.0"),
  });
  eq(res, { tag: "v1.7.0" });
});

Deno.test("prevTag: filters floating major before picking", async () => {
  // git tag --list 'v*' returns ALL v-prefixed; v1 should be filtered out.
  const res = await prevTag({
    gitRunner: ok("v1\nv1.7.0\nv1.6.0"),
  });
  eq(res.tag, "v1.7.0");
});

Deno.test("prevTag: null when repo has no release tags", async () => {
  const res = await prevTag({ gitRunner: ok("") });
  eq(res, { tag: null });
});

Deno.test("prevTag: null when only non-strict tags exist", async () => {
  const res = await prevTag({ gitRunner: ok("v1\nv2-rc1") });
  eq(res, { tag: null });
});

Deno.test("prevTag: throws on git failure", async () => {
  const fail: GitRunner = () =>
    Promise.resolve({ ok: false, stdout: "", stderr: "not a repo" });
  await rejects(
    () => prevTag({ gitRunner: fail }),
    /git tag failed: not a repo/,
  );
});

Deno.test("prevTag: trims whitespace around tags", async () => {
  const res = await prevTag({ gitRunner: ok("  v1.7.0  \n  v1.6.0  ") });
  eq(res.tag, "v1.7.0");
});
