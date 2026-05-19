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
  for (
    const t of ["docs", "chore", "ci", "refactor", "style", "test", "build"]
  ) {
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

Deno.test("subjectToBump: patchTypes promotes opted-in types to patch", () => {
  eq(subjectToBump("refactor: x", { patchTypes: ["refactor"] }), "patch");
  eq(subjectToBump("build: x", { patchTypes: ["build", "refactor"] }), "patch");
  eq(
    subjectToBump("refactor(scope): x", { patchTypes: ["refactor"] }),
    "patch",
  );
  // Default behaviour is unchanged when no options are supplied.
  eq(subjectToBump("refactor: x"), "none");
  eq(subjectToBump("build: x"), "none");
});

Deno.test("subjectToBump: minorTypes promotes opted-in types to minor", () => {
  eq(subjectToBump("refactor: x", { minorTypes: ["refactor"] }), "minor");
  eq(subjectToBump("docs: x", { minorTypes: ["docs"] }), "minor");
});

Deno.test("subjectToBump: built-in mappings always win over opt-in", () => {
  // `feat` is built-in minor; opting it into patch must not downgrade it.
  eq(subjectToBump("feat: x", { patchTypes: ["feat"] }), "minor");
  // `fix` is built-in patch; opting it into minor must not promote it.
  eq(subjectToBump("fix: x", { minorTypes: ["fix"] }), "patch");
  // Breaking marker always wins.
  eq(subjectToBump("refactor!: x", { patchTypes: ["refactor"] }), "major");
});

Deno.test("subjectToBump: minorTypes wins over patchTypes for same type", () => {
  eq(
    subjectToBump("refactor: x", {
      patchTypes: ["refactor"],
      minorTypes: ["refactor"],
    }),
    "minor",
  );
});

Deno.test("highestBump: applies options across the list", () => {
  eq(
    highestBump(["refactor: a", "docs: b"], { patchTypes: ["refactor"] }),
    "patch",
  );
  // Built-in feat still wins over opted-in patch.
  eq(
    highestBump(["refactor: a", "feat: b"], { patchTypes: ["refactor"] }),
    "minor",
  );
  // Opted-in minor beats built-in patch.
  eq(
    highestBump(["refactor: a", "fix: b"], { minorTypes: ["refactor"] }),
    "minor",
  );
});
