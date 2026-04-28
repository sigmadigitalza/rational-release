import { deepStrictEqual as equal, throws } from "node:assert/strict";
import {
  bucketPrs,
  extractSection,
  finaliseUnreleased,
  renderUnreleased,
  rewriteUnreleased,
} from "./changelog.ts";

const eq = <T>(actual: T, expected: T) => equal(actual, expected);

const bare = (
  number: number,
  title: string,
  login = "alice",
  isBot = false,
) => ({
  number,
  title,
  author: { login, is_bot: isBot },
});

Deno.test("bucketPrs: maps types to buckets", () => {
  const buckets = bucketPrs([
    bare(1, "feat: new widget"),
    bare(2, "fix: crash"),
    bare(3, "docs: readme"),
    bare(4, "revert: old feat"),
    bare(5, "Random non-conventional title"),
  ]);
  eq(buckets.get("Added"), ["- new widget (#1 by @alice)"]);
  eq(buckets.get("Fixed"), ["- crash (#2 by @alice)"]);
  eq(buckets.get("Changed"), ["- readme (#3 by @alice)"]);
  eq(buckets.get("Removed"), ["- old feat (#4 by @alice)"]);
  eq(buckets.get("Other"), ["- Random non-conventional title (#5 by @alice)"]);
});

Deno.test("bucketPrs: skips meta release-PR titles", () => {
  const buckets = bucketPrs([
    bare(1, "Release v1.2.3"),
    bare(2, "chore(release): refresh changelog for v1.2.3"),
    bare(3, "feat: real entry"),
  ]);
  eq([...buckets.keys()], ["Added"]);
  eq(buckets.get("Added"), ["- real entry (#3 by @alice)"]);
});

Deno.test("bucketPrs: bots get a quieter attribution", () => {
  const buckets = bucketPrs([bare(1, "feat: x", "renovate[bot]", true)]);
  eq(buckets.get("Added"), ["- x (#1)"]);
});

Deno.test("bucketPrs: deterministic order by PR number", () => {
  const buckets = bucketPrs([
    bare(7, "feat: g"),
    bare(2, "feat: b"),
    bare(5, "feat: e"),
  ]);
  eq(buckets.get("Added"), [
    "- b (#2 by @alice)",
    "- e (#5 by @alice)",
    "- g (#7 by @alice)",
  ]);
});

Deno.test("renderUnreleased: bucket order Added → Other", () => {
  const buckets = new Map<string, string[]>();
  buckets.set("Other", ["- z"]);
  buckets.set("Added", ["- a"]);
  const out = renderUnreleased(buckets);
  // Added must precede Other.
  if (out.indexOf("### Added") > out.indexOf("### Other")) {
    throw new Error("Bucket order wrong");
  }
});

Deno.test("renderUnreleased: empty → placeholder", () => {
  const out = renderUnreleased(new Map());
  if (!out.includes("_No user-visible changes")) {
    throw new Error("Expected placeholder");
  }
});

Deno.test("rewriteUnreleased: replaces only [Unreleased]", () => {
  const original = `# Changelog

## [Unreleased]

### Added

- old entry

## [1.0.0] - 2026-01-01

### Added

- preserved entry
`;
  const updated = rewriteUnreleased(original, "### Added\n\n- new entry\n");
  if (updated.includes("old entry")) throw new Error("Old [Unreleased] not replaced");
  if (!updated.includes("preserved entry")) throw new Error("Past section corrupted");
  if (!updated.includes("- new entry")) throw new Error("New body missing");
});

Deno.test("rewriteUnreleased: throws when [Unreleased] missing", () => {
  throws(() => rewriteUnreleased("# Changelog\n\n## [1.0.0]\n", "x"));
});

Deno.test("finaliseUnreleased: promotes header and prepends fresh block", () => {
  const original = `# Changelog

## [Unreleased]

### Added

- the feature

## [0.1.0] - 2026-01-01

### Added

- prior
`;
  const updated = finaliseUnreleased(original, "0.2.0", "2026-04-28");
  if (!updated.includes("## [0.2.0] - 2026-04-28")) {
    throw new Error("Version header not promoted");
  }
  // A fresh empty [Unreleased] should now sit above [0.2.0].
  const idxUnreleased = updated.indexOf("## [Unreleased]");
  const idx020 = updated.indexOf("## [0.2.0]");
  if (idxUnreleased < 0 || idxUnreleased >= idx020) {
    throw new Error("Fresh [Unreleased] not prepended above new version");
  }
  if (!updated.includes("- the feature")) throw new Error("Body lost in promotion");
  if (!updated.includes("## [0.1.0] - 2026-01-01")) throw new Error("Prior section lost");
});

Deno.test("extractSection: returns body of named version", () => {
  const cl = `# Changelog

## [Unreleased]

### Added

- u1

## [1.0.0] - 2026-01-01

### Added

- a1

### Fixed

- f1

## [0.9.0] - 2025-12-01

- old
`;
  const body = extractSection(cl, "1.0.0");
  if (!body.includes("- a1")) throw new Error("Missing entry from target section");
  if (body.includes("- u1")) throw new Error("Bled into [Unreleased] above");
  if (body.includes("- old")) throw new Error("Bled into older section below");
});

Deno.test("extractSection: missing version → empty string", () => {
  eq(extractSection("# Changelog\n\n## [Unreleased]\n", "9.9.9"), "");
});
