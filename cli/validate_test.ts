import { deepStrictEqual as equal } from "node:assert/strict";
import { validateTitle } from "./validate.ts";

const DEFAULT_TYPES = [
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

Deno.test("validateTitle: valid conventional title", () => {
  const r = validateTitle("feat: add widget", DEFAULT_TYPES, false);
  equal(r.ok, true);
  equal(r.reason, "");
  equal(r.parsed?.type, "feat");
});

Deno.test("validateTitle: valid with scope", () => {
  const r = validateTitle("fix(auth): null check", DEFAULT_TYPES, false);
  equal(r.ok, true);
  equal(r.parsed?.scope, "auth");
});

Deno.test("validateTitle: non-conventional title fails", () => {
  const r = validateTitle("Update README", DEFAULT_TYPES, false);
  equal(r.ok, false);
  equal(r.parsed, null);
  if (!r.reason.includes("does not match")) throw new Error("Wrong reason");
});

Deno.test("validateTitle: disallowed type fails", () => {
  const r = validateTitle("feat: add widget", ["fix", "docs"], false);
  equal(r.ok, false);
  if (!r.reason.includes("not in the allowed list")) {
    throw new Error("Wrong reason");
  }
});

Deno.test("validateTitle: require-scope rejects scopeless", () => {
  const r = validateTitle("feat: add widget", DEFAULT_TYPES, true);
  equal(r.ok, false);
  if (!r.reason.includes("Scope is required")) throw new Error("Wrong reason");
});

Deno.test("validateTitle: require-scope passes with scope", () => {
  const r = validateTitle("feat(core): add widget", DEFAULT_TYPES, true);
  equal(r.ok, true);
});
