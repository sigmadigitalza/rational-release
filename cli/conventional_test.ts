import { deepStrictEqual as equal } from "node:assert/strict";
import { highestBump, parseSubject, subjectToBump } from "./conventional.ts";

const eq = <T>(actual: T, expected: T) => equal(actual, expected);

Deno.test("parseSubject: basic conventional commit", () => {
  eq(parseSubject("feat: add widget"), {
    type: "feat",
    scope: null,
    breaking: false,
    description: "add widget",
  });
});

Deno.test("parseSubject: with scope", () => {
  eq(parseSubject("fix(auth): null check"), {
    type: "fix",
    scope: "auth",
    breaking: false,
    description: "null check",
  });
});

Deno.test("parseSubject: breaking marker", () => {
  eq(parseSubject("feat!: rewrite API")?.breaking, true);
  eq(parseSubject("fix(core)!: change return type")?.breaking, true);
});

Deno.test("parseSubject: case-insensitive type", () => {
  eq(parseSubject("Feat: capital")?.type, "feat");
});

Deno.test("parseSubject: non-conventional → null", () => {
  eq(parseSubject("Update README"), null);
  eq(parseSubject("Merge pull request #42"), null);
  eq(parseSubject(""), null);
});

Deno.test("subjectToBump: feat → minor", () => {
  eq(subjectToBump("feat: x"), "minor");
  eq(subjectToBump("feat(scope): x"), "minor");
});

Deno.test("subjectToBump: fix and perf → patch", () => {
  eq(subjectToBump("fix: x"), "patch");
  eq(subjectToBump("perf: x"), "patch");
});

Deno.test("subjectToBump: breaking → major", () => {
  eq(subjectToBump("feat!: x"), "major");
  eq(subjectToBump("refactor!: x"), "major");
});

Deno.test("subjectToBump: docs/chore/ci/refactor/style/test/build → none", () => {
  for (const t of ["docs", "chore", "ci", "refactor", "style", "test", "build"]) {
    eq(subjectToBump(`${t}: x`), "none");
  }
});

Deno.test("subjectToBump: non-conventional → none", () => {
  eq(subjectToBump("Update README"), "none");
  eq(subjectToBump(""), "none");
});

Deno.test("highestBump: empty list → none", () => {
  eq(highestBump([]), "none");
});

Deno.test("highestBump: picks the highest", () => {
  eq(
    highestBump(["fix: a", "feat: b", "docs: c"]),
    "minor",
  );
  eq(
    highestBump(["fix: a", "feat: b", "feat!: c"]),
    "major",
  );
});

Deno.test("highestBump: only non-bumping → none", () => {
  eq(highestBump(["docs: a", "chore: b", "ci: c"]), "none");
});
