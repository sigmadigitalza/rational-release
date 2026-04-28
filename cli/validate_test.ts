import { deepStrictEqual as equal } from "node:assert/strict";
import { validateCommits, validateTitle } from "./validate.ts";

const eq = <T>(actual: T, expected: T) => equal(actual, expected);

Deno.test("validateTitle: valid feat passes", () => {
  const v = validateTitle("feat: add new icons");
  eq(v.ok, true);
  eq(v.errors, []);
});

Deno.test("validateTitle: valid scoped passes", () => {
  eq(validateTitle("fix(ui): correct hover state").ok, true);
});

Deno.test("validateTitle: breaking-change marker passes", () => {
  eq(validateTitle("feat!: redesign buttons").ok, true);
});

Deno.test("validateTitle: empty title fails", () => {
  const v = validateTitle("");
  eq(v.ok, false);
  eq(v.errors[0].includes("empty"), true);
});

Deno.test("validateTitle: missing type fails", () => {
  const v = validateTitle("add new icons");
  eq(v.ok, false);
  eq(v.errors[0].includes("does not match"), true);
});

Deno.test("validateTitle: unknown type fails", () => {
  const v = validateTitle("yolo: do stuff");
  eq(v.ok, false);
  eq(v.errors[0].includes("Unknown type"), true);
});

Deno.test("validateTitle: all default types pass", () => {
  const types = [
    "feat",
    "fix",
    "docs",
    "style",
    "refactor",
    "perf",
    "test",
    "build",
    "ci",
    "chore",
    "revert",
  ];
  for (const t of types) {
    eq(validateTitle(`${t}: description`).ok, true);
  }
});

Deno.test("validateTitle: requireScope flag enforces scope", () => {
  const v = validateTitle("feat: missing scope", { requireScope: true });
  eq(v.ok, false);
  eq(v.errors.some((e) => e.includes("Scope is required")), true);
});

Deno.test("validateTitle: custom allowedTypes restricts list", () => {
  const v = validateTitle("docs: tweak", { allowedTypes: ["feat", "fix"] });
  eq(v.ok, false);
  eq(v.errors[0].includes("Unknown type"), true);
});

Deno.test("validateCommits: all valid → passed=count", () => {
  const v = validateCommits([
    "feat: add icon",
    "fix: correct path",
    "chore: rebuild",
  ]);
  eq(v.passed, 3);
  eq(v.failed, 0);
  eq(v.skipped, 0);
});

Deno.test("validateCommits: merge commits skipped", () => {
  const v = validateCommits(["Merge branch 'main' into feature"]);
  eq(v.skipped, 1);
  eq(v.failed, 0);
});

Deno.test("validateCommits: 'Initial plan' skipped", () => {
  const v = validateCommits(["Initial plan"]);
  eq(v.skipped, 1);
  eq(v.failed, 0);
});

Deno.test("validateCommits: invalid header fails", () => {
  const v = validateCommits(["bad message"]);
  eq(v.failed, 1);
  eq(v.results[0].ok, false);
});

Deno.test("validateCommits: one bad among good fails overall", () => {
  const v = validateCommits([
    "feat: good",
    "bad message",
    "fix: also good",
  ]);
  eq(v.passed, 2);
  eq(v.failed, 1);
});

Deno.test("validateCommits: multi-line message validates first line only", () => {
  const v = validateCommits(["feat: top\n\nbody line"]);
  eq(v.passed, 1);
  eq(v.results[0].header, "feat: top");
});

Deno.test("validateCommits: empty list yields no results", () => {
  const v = validateCommits([]);
  eq(v.results.length, 0);
  eq(v.passed, 0);
  eq(v.failed, 0);
});
