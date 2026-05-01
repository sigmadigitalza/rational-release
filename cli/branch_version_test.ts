import { deepStrictEqual as equal, throws } from "node:assert/strict";
import { branchVersion } from "./branch_version.ts";

const eq = <T>(actual: T, expected: T) => equal(actual, expected);

Deno.test("branchVersion: strips default prefix", () => {
  eq(branchVersion("release/v1.2.3", "release/v"), "1.2.3");
});

Deno.test("branchVersion: tolerates large numbers", () => {
  eq(branchVersion("release/v10.20.30", "release/v"), "10.20.30");
});

Deno.test("branchVersion: rejects pre-release suffix", () => {
  throws(() => branchVersion("release/v1.2.3-rc1", "release/v"));
  throws(() => branchVersion("release/v1.2.3+build", "release/v"));
});

Deno.test("branchVersion: rejects extra segments", () => {
  throws(() => branchVersion("release/v1.2.3.4", "release/v"));
  throws(() => branchVersion("release/v1.2", "release/v"));
});

Deno.test("branchVersion: rejects non-numeric segments", () => {
  throws(() => branchVersion("release/vfoo.bar.baz", "release/v"));
  throws(() => branchVersion("release/v1.2.x", "release/v"));
});

Deno.test("branchVersion: rejects branches not under the prefix", () => {
  throws(() => branchVersion("main", "release/v"));
  throws(() => branchVersion("feature/release/v1.2.3", "release/v"));
});

Deno.test("branchVersion: rejects an inadvertent leading v in the version part", () => {
  // Prefix already ends with "v"; "vv1.2.3" must not slip through.
  throws(() => branchVersion("release/vv1.2.3", "release/v"));
});

Deno.test("branchVersion: empty prefix is rejected", () => {
  throws(() => branchVersion("1.2.3", ""));
});

Deno.test("branchVersion: custom prefix works", () => {
  eq(branchVersion("rel-1.2.3", "rel-"), "1.2.3");
});
