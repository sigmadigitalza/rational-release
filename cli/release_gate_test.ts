import { deepStrictEqual as equal } from "node:assert/strict";
import { releaseGate } from "./release_gate.ts";

const eq = <T>(actual: T, expected: T) => equal(actual, expected);

Deno.test("releaseGate: first release proceeds even without bump", () => {
  const v = releaseGate("", "0.1.0", false);
  eq(v.proceed, true);
  eq(v.reason.includes("no previous release"), true);
});

Deno.test("releaseGate: first release proceeds with bump", () => {
  eq(releaseGate("", "0.1.0", true).proceed, true);
});

Deno.test("releaseGate: bumped commits proceed", () => {
  const v = releaseGate("v1.2.3", "1.2.3", true);
  eq(v.proceed, true);
  eq(v.reason, "version bump detected");
});

Deno.test("releaseGate: no bump and manifest matches tag → skip", () => {
  const v = releaseGate("v1.2.3", "1.2.3", false);
  eq(v.proceed, false);
  eq(v.reason.includes("no version-bumping commits"), true);
});

Deno.test("releaseGate: manifest ahead of tag → skip (release in flight)", () => {
  const v = releaseGate("v1.2.3", "1.2.4", true);
  eq(v.proceed, false);
  eq(v.reason.includes("release in flight"), true);
});

Deno.test("releaseGate: manifest ahead by minor → skip", () => {
  eq(releaseGate("v1.2.3", "1.3.0", false).proceed, false);
});

Deno.test("releaseGate: manifest ahead by major → skip", () => {
  eq(releaseGate("v1.2.3", "2.0.0", true).proceed, false);
});

Deno.test("releaseGate: manifest behind tag (recovery) → no in-flight skip", () => {
  // Manifest somehow regressed below the latest tag. Not a normal state,
  // but we should not treat it as "in flight" — fall through to the
  // bumped/no-bumped decision so a fresh bump can recover.
  const bumped = releaseGate("v1.2.3", "1.2.2", true);
  eq(bumped.proceed, true);
  const noBump = releaseGate("v1.2.3", "1.2.2", false);
  eq(noBump.proceed, false);
});

Deno.test("releaseGate: tag without v prefix is tolerated", () => {
  const v = releaseGate("1.2.3", "1.2.3", true);
  eq(v.proceed, true);
});

Deno.test("releaseGate: numerically-correct semver compare (10 > 2)", () => {
  // String sort would put 1.2.10 before 1.2.2 — confirm we don't.
  const v = releaseGate("v1.2.2", "1.2.10", false);
  eq(v.proceed, false);
  eq(v.reason.includes("release in flight"), true);
});
