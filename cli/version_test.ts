import { deepStrictEqual as equal, throws } from "node:assert/strict";
import { nextVersion, parseVersion } from "./version.ts";

const eq = <T>(actual: T, expected: T) => equal(actual, expected);

Deno.test("parseVersion: valid", () => {
  eq(parseVersion("0.1.0"), [0, 1, 0]);
  eq(parseVersion("12.34.56"), [12, 34, 56]);
});

Deno.test("parseVersion: rejects non-semver", () => {
  throws(() => parseVersion("v1.0.0"));
  throws(() => parseVersion("1.0"));
  throws(() => parseVersion("1.0.0-rc.1"));
  throws(() => parseVersion(""));
});

Deno.test("nextVersion: post-1.0 follows standard semver", () => {
  eq(nextVersion("1.2.3", "major"), "2.0.0");
  eq(nextVersion("1.2.3", "minor"), "1.3.0");
  eq(nextVersion("1.2.3", "patch"), "1.2.4");
  eq(nextVersion("1.2.3", "none"), "1.2.3");
});

Deno.test("nextVersion: pre-1.0 default keeps major as major", () => {
  // No pre1Cap option → 0.x → 1.0.0 on a breaking change.
  eq(nextVersion("0.1.0", "major"), "1.0.0");
});

Deno.test("nextVersion: pre-1.0 cap downgrades major→minor", () => {
  eq(nextVersion("0.1.0", "major", { pre1Cap: true }), "0.2.0");
  eq(nextVersion("0.1.0", "minor", { pre1Cap: true }), "0.2.0");
  eq(nextVersion("0.1.0", "patch", { pre1Cap: true }), "0.1.1");
});

Deno.test("nextVersion: pre-1.0 cap doesn't affect non-breaking bumps post-1.0", () => {
  eq(nextVersion("1.2.3", "major", { pre1Cap: true }), "2.0.0");
});
