import { deepStrictEqual as equal } from "node:assert/strict";
import {
  classifyCommit,
  type CommitEntry,
  escapeHtml,
  groupBySection,
  parseGitLogLine,
  parseOriginRepo,
  readExistingHistory,
  renderHtml,
  renderMarkdown,
} from "./build_changelog.ts";

const eq = <T>(actual: T, expected: T) => equal(actual, expected);

Deno.test("classifyCommit: feat → Features", () => {
  eq(classifyCommit("feat: add navigation"), {
    section: "Features",
    title: "add navigation",
  });
});

Deno.test("classifyCommit: fix(scope) → Bug Fixes", () => {
  eq(classifyCommit("fix(ui): correct state"), {
    section: "Bug Fixes",
    title: "correct state",
  });
});

Deno.test("classifyCommit: unknown type → Other with full subject", () => {
  eq(classifyCommit("misc update"), {
    section: "Other",
    title: "misc update",
  });
});

Deno.test("classifyCommit: every conventional type maps to a section", () => {
  const map: Record<string, string> = {
    feat: "Features",
    fix: "Bug Fixes",
    perf: "Performance Improvements",
    refactor: "Refactoring",
    revert: "Reverts",
    docs: "Documentation",
    test: "Tests",
    build: "Build System",
    ci: "Continuous Integration",
    style: "Styles",
    chore: "Chores",
  };
  for (const [type, section] of Object.entries(map)) {
    eq(classifyCommit(`${type}: x`).section, section);
  }
});

Deno.test("parseGitLogLine: parses sha\\tsubject", () => {
  const c = parseGitLogLine("abc1234\tfeat: add x");
  eq(c?.sha, "abc1234");
  eq(c?.section, "Features");
  eq(c?.title, "add x");
});

Deno.test("parseGitLogLine: malformed → null", () => {
  eq(parseGitLogLine("no-tab-here"), null);
  eq(parseGitLogLine(""), null);
});

Deno.test("groupBySection: groups by section name", () => {
  const commits: CommitEntry[] = [
    { sha: "1", subject: "feat: a", section: "Features", title: "a" },
    { sha: "2", subject: "fix: b", section: "Bug Fixes", title: "b" },
    { sha: "3", subject: "feat: c", section: "Features", title: "c" },
  ];
  const grouped = groupBySection(commits);
  eq(grouped["Features"].length, 2);
  eq(grouped["Bug Fixes"].length, 1);
});

Deno.test("readExistingHistory: empty input → empty string", () => {
  eq(readExistingHistory(""), "");
});

Deno.test("readExistingHistory: no versioned headings → empty", () => {
  eq(
    readExistingHistory(
      "# Changelog\n\n## [Unreleased]\n\n* commit\n",
    ),
    "",
  );
});

Deno.test("readExistingHistory: extracts from first versioned heading", () => {
  const text = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "* new",
    "",
    "## [1.2.0](https://example.com/compare/v1.1.0...v1.2.0) (2026-01-01)",
    "",
    "* old feature",
    "",
    "## 1.0.0 (2025-12-01)",
    "",
    "* fix",
    "",
  ].join("\n");
  const result = readExistingHistory(text);
  eq(result.startsWith("## [1.2.0]"), true);
  eq(result.includes("## 1.0.0"), true);
  eq(result.includes("[Unreleased]"), false);
  eq(result.includes("# Changelog"), false);
});

Deno.test("parseOriginRepo: ssh URL", () => {
  eq(parseOriginRepo("git@github.com:owner/repo.git"), "owner/repo");
});

Deno.test("parseOriginRepo: https URL with .git", () => {
  eq(parseOriginRepo("https://github.com/owner/repo.git"), "owner/repo");
});

Deno.test("parseOriginRepo: https URL without .git", () => {
  eq(parseOriginRepo("https://github.com/owner/repo"), "owner/repo");
});

Deno.test("escapeHtml: escapes the five entities", () => {
  eq(
    escapeHtml(`<a href="x">'&'</a>`),
    "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
  );
});

Deno.test("renderMarkdown: renders Unreleased section with sections", () => {
  const md = renderMarkdown({
    repo: "owner/repo",
    unreleased: {
      fromTag: "v1.0.0",
      commits: [
        {
          sha: "abc1234567",
          subject: "feat: a",
          section: "Features",
          title: "a",
        },
        {
          sha: "def7654321",
          subject: "fix: b",
          section: "Bug Fixes",
          title: "b",
        },
      ],
    },
  });
  eq(md.includes("# Changelog"), true);
  eq(
    md.includes(
      "## [Unreleased](https://github.com/owner/repo/compare/v1.0.0...HEAD)",
    ),
    true,
  );
  eq(md.includes("### Features"), true);
  eq(md.includes("### Bug Fixes"), true);
  eq(
    md.includes("[abc1234](https://github.com/owner/repo/commit/abc1234567)"),
    true,
  );
});

Deno.test("renderMarkdown: no fromTag → plain Unreleased heading", () => {
  const md = renderMarkdown({
    repo: "o/r",
    unreleased: {
      fromTag: null,
      commits: [{
        sha: "1",
        subject: "feat: x",
        section: "Features",
        title: "x",
      }],
    },
  });
  eq(md.includes("## [Unreleased]\n"), true);
});

Deno.test("renderMarkdown: preservedHistory takes precedence over releases", () => {
  const md = renderMarkdown({
    repo: "o/r",
    preservedHistory: "## [1.0.0] (2025-01-01)\n\n* old",
    releases: [{
      version: "0.9.0",
      fromTag: null,
      toTag: "v0.9.0",
      date: "2024-01-01",
      commits: [],
    }],
  });
  eq(md.includes("## [1.0.0] (2025-01-01)"), true);
  eq(md.includes("0.9.0"), false);
});

Deno.test("renderMarkdown: release with fromTag uses compare URL", () => {
  const md = renderMarkdown({
    repo: "o/r",
    releases: [{
      version: "1.1.0",
      fromTag: "v1.0.0",
      toTag: "v1.1.0",
      date: "2026-01-01",
      commits: [{
        sha: "1",
        subject: "feat: x",
        section: "Features",
        title: "x",
      }],
    }],
  });
  eq(
    md.includes(
      "## [1.1.0](https://github.com/o/r/compare/v1.0.0...v1.1.0) (2026-01-01)",
    ),
    true,
  );
});

Deno.test("renderMarkdown: release without fromTag uses tag URL", () => {
  const md = renderMarkdown({
    repo: "o/r",
    releases: [{
      version: "1.0.0",
      fromTag: null,
      toTag: "v1.0.0",
      date: "2025-12-01",
      commits: [{
        sha: "1",
        subject: "feat: x",
        section: "Features",
        title: "x",
      }],
    }],
  });
  eq(
    md.includes(
      "## [1.0.0](https://github.com/o/r/releases/tag/v1.0.0) (2025-12-01)",
    ),
    true,
  );
});

Deno.test("renderHtml: produces a valid-looking page with site chrome", () => {
  const html = renderHtml({
    repo: "owner/repo",
    unreleased: {
      fromTag: "v1.0.0",
      commits: [{
        sha: "abc1234567",
        subject: "feat: a",
        section: "Features",
        title: "a",
      }],
    },
  });
  eq(html.startsWith("<!doctype html>"), true);
  eq(html.includes("<title>Changelog"), true);
  eq(html.includes('class="site-header"'), true);
  eq(html.includes("changelog.html"), true);
  eq(
    html.includes("https://github.com/owner/repo/compare/v1.0.0...HEAD"),
    true,
  );
  eq(html.includes("<h3>Features</h3>"), true);
  eq(html.includes("<code>abc1234</code>"), true);
});

Deno.test("listVersionTags: filters out non-semver pin tags", async () => {
  // Build a throwaway git repo with v1.0.0, v1.1.0, and a floating v1.
  const dir = await Deno.makeTempDir({ prefix: "rr-list-tags-" });
  try {
    const { runGit, listVersionTags } = await import("./build_changelog.ts");
    runGit(["init", "--quiet", "--initial-branch=main"], dir);
    runGit(["config", "user.email", "test@example.com"], dir);
    runGit(["config", "user.name", "Test"], dir);
    runGit(["commit", "--allow-empty", "-m", "initial"], dir);
    runGit(["tag", "v1.0.0"], dir);
    runGit(["commit", "--allow-empty", "-m", "feat: x"], dir);
    runGit(["tag", "v1.1.0"], dir);
    runGit(["tag", "v1"], dir); // floating major pin

    const tags = listVersionTags(dir);
    eq(tags.includes("v1.0.0"), true);
    eq(tags.includes("v1.1.0"), true);
    eq(tags.includes("v1"), false);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("renderHtml: escapes repo and headings", () => {
  const html = renderHtml({
    repo: "<bad>/<repo>",
    unreleased: { fromTag: null, commits: [] },
  });
  eq(html.includes("<bad>/<repo>"), false);
  eq(html.includes("&lt;bad&gt;/&lt;repo&gt;"), true);
});
