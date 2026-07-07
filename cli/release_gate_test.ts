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

Deno.test("releaseGate: non-strict prevTag with bump → proceed (in-flight check skipped)", () => {
  // `git tag --list 'v*'` will surface tags like v1.0 or v0.5-beta. The
  // gate must not crash on these; instead it should fall through to the
  // bumped check and tell the operator why.
  const v = releaseGate("v1.0", "1.2.3", true);
  eq(v.proceed, true);
  eq(v.reason.includes("not strict semver"), true);
  eq(v.reason.includes("in-flight check skipped"), true);
});

Deno.test("releaseGate: non-strict prevTag without bump → skip", () => {
  const v = releaseGate("v0.5-beta", "1.0.0", false);
  eq(v.proceed, false);
  eq(v.reason.includes("no version-bumping commits"), true);
});

// ── Stranded-release self-heal (manifest ahead of the newest tag) ──────

Deno.test("releaseGate: ahead with no signals → conservative in-flight skip", () => {
  // Backwards-compat: omitting signals keeps the pre-1.9 behaviour.
  const v = releaseGate("v1.2.3", "1.2.4", true);
  eq(v.proceed, false);
  eq(v.reason.includes("release in flight"), true);
  eq(v.recover, undefined);
});

Deno.test("releaseGate: ahead + open release PR → skip (in flight)", () => {
  const v = releaseGate("v1.2.3", "1.2.4", true, {
    currentTagExists: false,
    openReleasePr: true,
  });
  eq(v.proceed, false);
  eq(v.reason.includes("release in flight"), true);
  eq(v.reason.includes("release PR open"), true);
});

Deno.test("releaseGate: ahead + no tag + no open PR → recover (stranded)", () => {
  const v = releaseGate("v1.2.3", "1.2.4", true, {
    currentTagExists: false,
    openReleasePr: false,
  });
  eq(v.proceed, true);
  eq(v.recover, true);
  eq(v.reason.includes("recovering stranded release"), true);
});

Deno.test("releaseGate: stranded recovery fires even without a fresh bump", () => {
  // The un-cut work may be the only change since prevTag (bumped=false
  // relative to the manifest). We must still re-release it.
  const v = releaseGate("v1.2.3", "1.2.4", false, {
    currentTagExists: false,
    openReleasePr: false,
  });
  eq(v.proceed, true);
  eq(v.recover, true);
});

Deno.test("releaseGate: ahead but v{current} already tagged → skip (released)", () => {
  const v = releaseGate("v1.2.3", "1.2.4", true, {
    currentTagExists: true,
    openReleasePr: false,
  });
  eq(v.proceed, false);
  eq(v.reason.includes("already released"), true);
});

Deno.test("releaseGate: signals ignored when manifest is not ahead", () => {
  // A normal bump with a matching tag should proceed regardless of the
  // stranded-detection signals.
  const v = releaseGate("v1.2.3", "1.2.3", true, {
    currentTagExists: true,
    openReleasePr: false,
  });
  eq(v.proceed, true);
  eq(v.reason, "version bump detected");
});

Deno.test("releaseGate: non-strict current → refuse", () => {
  // Manifest in a bad state (e.g. someone wrote "1.2.3-rc1"). Don't
  // proceed and don't crash; surface a clear reason for the operator.
  const v = releaseGate("v1.2.3", "1.2.3-rc1", true);
  eq(v.proceed, false);
  eq(v.reason.includes("not strict X.Y.Z"), true);
  eq(v.reason.includes("refusing to gate"), true);
});

Deno.test("releaseGate: non-strict current without prev → refuse takes precedence", () => {
  // First release with a bad manifest: still refuse. Bad input is more
  // important to surface than the first-release shortcut.
  const v = releaseGate("v1.0.0", "not-a-version", true);
  eq(v.proceed, false);
  eq(v.reason.includes("not strict X.Y.Z"), true);
});
