import { deepStrictEqual as equal, throws } from "node:assert/strict";
import { readVersion, writeVersion } from "./manifest.ts";

const eq = <T>(actual: T, expected: T) => equal(actual, expected);

Deno.test("readVersion: top-level $.version", () => {
  eq(readVersion({ version: "1.2.3" }, "$.version"), "1.2.3");
});

Deno.test("readVersion: nested path", () => {
  eq(
    readVersion(
      { project: { meta: { version: "0.4.0" } } },
      "$.project.meta.version",
    ),
    "0.4.0",
  );
});

Deno.test("readVersion: missing field throws", () => {
  throws(() => readVersion({}, "$.version"));
  throws(() => readVersion({ version: 42 }, "$.version"));
});

Deno.test("readVersion: rejects unsupported JSONPath", () => {
  throws(() => readVersion({}, "$.[0]"));
  throws(() => readVersion({}, "version"));
  throws(() => readVersion({}, "$..version"));
});

Deno.test("writeVersion: top-level update", () => {
  const updated = writeVersion(
    { version: "1.0.0", name: "x" },
    "$.version",
    "1.1.0",
  );
  eq(updated, { version: "1.1.0", name: "x" });
});

Deno.test("writeVersion: nested update preserves siblings", () => {
  const original = {
    project: { meta: { version: "0.1.0", author: "a" }, other: 1 },
  };
  const updated = writeVersion(original, "$.project.meta.version", "0.2.0");
  eq(updated.project.meta.version, "0.2.0");
  eq(updated.project.meta.author, "a");
  eq(updated.project.other, 1);
});

Deno.test("writeVersion: does not mutate input", () => {
  const original = { version: "1.0.0" };
  writeVersion(original, "$.version", "2.0.0");
  eq(original.version, "1.0.0");
});
