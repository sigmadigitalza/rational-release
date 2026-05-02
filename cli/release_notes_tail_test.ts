import { deepStrictEqual as equal } from "node:assert/strict";
import { renderReleaseNotesTail } from "./release_notes_tail.ts";

const eq = <T>(actual: T, expected: T) => equal(actual, expected);

const PR = (
  number: number,
  title: string,
  mergedAt: string,
  login = "alice",
  isBot = false,
) => ({
  number,
  title,
  mergedAt,
  author: { login, is_bot: isBot },
});

Deno.test("renderReleaseNotesTail: filters by sinceEpoch (strictly greater)", () => {
  // sinceEpoch is the merge-commit timestamp of PREV_TAG; PRs merged at
  // exactly that time are the release commit itself and should be skipped.
  const since = 1_700_000_000;
  const out = renderReleaseNotesTail({
    prs: [
      PR(1, "feat: kept", new Date((since + 60) * 1000).toISOString()),
      PR(2, "feat: same-second skipped", new Date(since * 1000).toISOString()),
      PR(3, "feat: earlier skipped", new Date((since - 60) * 1000).toISOString()),
    ],
    sinceEpoch: since,
    prevTag: "v1.2.3",
    version: "1.3.0",
    repo: "sigmadigitalza/rational-release",
  });
  if (!out.includes("kept")) throw new Error("expected kept PR in output");
  if (out.includes("same-second")) throw new Error("equal-time PR not filtered");
  if (out.includes("earlier")) throw new Error("earlier PR not filtered");
});

Deno.test("renderReleaseNotesTail: orders by PR number", () => {
  const ts = new Date(1_700_000_100 * 1000).toISOString();
  const out = renderReleaseNotesTail({
    prs: [PR(7, "feat: g", ts), PR(2, "feat: b", ts), PR(5, "feat: e", ts)],
    sinceEpoch: 1_700_000_000,
    prevTag: null,
    version: "1.0.0",
    repo: null,
  });
  const idxB = out.indexOf("(#2");
  const idxE = out.indexOf("(#5");
  const idxG = out.indexOf("(#7");
  if (!(idxB < idxE && idxE < idxG)) {
    throw new Error(`PRs not ordered by number: ${out}`);
  }
});

Deno.test("renderReleaseNotesTail: bots get a quieter attribution", () => {
  const ts = new Date(1_700_000_100 * 1000).toISOString();
  const out = renderReleaseNotesTail({
    prs: [PR(1, "feat: x", ts, "renovate[bot]", true)],
    sinceEpoch: 1_700_000_000,
    prevTag: null,
    version: "1.0.0",
    repo: null,
  });
  if (!out.includes("- feat: x (#1)\n")) {
    throw new Error(`bot attribution not stripped: ${out}`);
  }
});

Deno.test("renderReleaseNotesTail: missing author falls back to no @login", () => {
  const ts = new Date(1_700_000_100 * 1000).toISOString();
  const out = renderReleaseNotesTail({
    prs: [{ number: 1, title: "feat: x", mergedAt: ts, author: null }],
    sinceEpoch: 1_700_000_000,
    prevTag: null,
    version: "1.0.0",
    repo: null,
  });
  if (!out.includes("- feat: x (#1)\n")) {
    throw new Error(`null author not handled: ${out}`);
  }
});

Deno.test("renderReleaseNotesTail: empty list emits placeholder", () => {
  const out = renderReleaseNotesTail({
    prs: [],
    sinceEpoch: 0,
    prevTag: null,
    version: "1.0.0",
    repo: null,
  });
  if (!out.includes("_No merged pull requests")) {
    throw new Error("expected placeholder for empty list");
  }
});

Deno.test("renderReleaseNotesTail: emits compare link when prev tag and repo present", () => {
  const ts = new Date(1_700_000_100 * 1000).toISOString();
  const out = renderReleaseNotesTail({
    prs: [PR(1, "feat: x", ts)],
    sinceEpoch: 1_700_000_000,
    prevTag: "v1.2.3",
    version: "1.3.0",
    repo: "sigmadigitalza/rational-release",
  });
  if (
    !out.includes(
      "**Full diff:** https://github.com/sigmadigitalza/rational-release/compare/v1.2.3...v1.3.0",
    )
  ) {
    throw new Error(`compare link missing or malformed: ${out}`);
  }
});

Deno.test("renderReleaseNotesTail: no compare link when prev tag absent", () => {
  const ts = new Date(1_700_000_100 * 1000).toISOString();
  const out = renderReleaseNotesTail({
    prs: [PR(1, "feat: x", ts)],
    sinceEpoch: 0,
    prevTag: null,
    version: "1.0.0",
    repo: "sigmadigitalza/rational-release",
  });
  if (out.includes("Full diff:")) {
    throw new Error("compare link should be omitted when prev tag is null");
  }
});

Deno.test("renderReleaseNotesTail: tolerates --version normalization (caller responsibility)", () => {
  // The CLI strips a leading "v" before passing through; the renderer
  // itself just builds `vX.Y.Z` in the compare URL and trusts the input.
  const ts = new Date(1_700_000_100 * 1000).toISOString();
  const out = renderReleaseNotesTail({
    prs: [PR(1, "feat: x", ts)],
    sinceEpoch: 0,
    prevTag: "v1.0.0",
    version: "1.1.0",
    repo: "owner/repo",
  });
  if (!out.includes("compare/v1.0.0...v1.1.0")) {
    throw new Error(`compare URL malformed: ${out}`);
  }
});

Deno.test("renderReleaseNotesTail: starts with leading blank line and PR header", () => {
  const out = renderReleaseNotesTail({
    prs: [],
    sinceEpoch: 0,
    prevTag: null,
    version: "1.0.0",
    repo: null,
  });
  // Matches the bash version's `echo` then `### Pull requests in this release`.
  eq(out.startsWith("\n### Pull requests in this release\n"), true);
});
