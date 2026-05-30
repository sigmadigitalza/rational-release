import { deepStrictEqual as eq, rejects } from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_DENO_JSON_PATH,
  readCliVersion,
  resolveDenoJsonPath,
} from "./cli_version.ts";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "rr-cli-version-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

Deno.test("readCliVersion: reads version from a fixture deno.json", () =>
  withTempDir(async (dir) => {
    const path = join(dir, "deno.json");
    await writeFile(path, JSON.stringify({ version: "9.8.7" }));
    eq(await readCliVersion(path), "9.8.7");
  }));

Deno.test("readCliVersion: default path points at the package's own deno.json", async () => {
  // Sanity check that the bundled default lands on the repo manifest
  // when the module is run from a checkout. The exact value is the
  // current CLI version, but we only assert shape (X.Y.Z) so the test
  // doesn't churn on every release.
  const version = await readCliVersion(DEFAULT_DENO_JSON_PATH);
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`expected X.Y.Z, got ${JSON.stringify(version)}`);
  }
});

Deno.test("resolveDenoJsonPath: file: URL resolves to a local filesystem path", () => {
  const path = resolveDenoJsonPath("file:///home/x/cli/cli_version.ts");
  // One directory up, converted off the URL scheme into a real path.
  eq(path.endsWith("deno.json"), true);
  eq(path.startsWith("file:"), false);
  eq(path.startsWith("http"), false);
});

Deno.test("resolveDenoJsonPath: https (jsr) URL keeps the href instead of throwing", () => {
  // Regression: fileURLToPath() throws "The URL must be of scheme file"
  // on an https module URL. Loaded via jsr: the CLI must still import,
  // so non-file: URLs resolve to the sibling deno.json href.
  const url =
    "https://jsr.io/@sigmadigitalza/rational-release/1.8.0/cli/cli_version.ts";
  eq(
    resolveDenoJsonPath(url),
    "https://jsr.io/@sigmadigitalza/rational-release/1.8.0/deno.json",
  );
});

Deno.test("readCliVersion: throws when file is missing", () =>
  withTempDir(async (dir) => {
    const path = join(dir, "missing.json");
    await rejects(() => readCliVersion(path), /failed to read/);
  }));

Deno.test("readCliVersion: throws when JSON is malformed", () =>
  withTempDir(async (dir) => {
    const path = join(dir, "deno.json");
    await writeFile(path, "{not json");
    await rejects(() => readCliVersion(path), /not valid JSON/);
  }));

Deno.test("readCliVersion: throws when manifest is not an object", () =>
  withTempDir(async (dir) => {
    const path = join(dir, "deno.json");
    await writeFile(path, JSON.stringify(["array"]));
    // Arrays parse as objects to JS, so the version-field check fires
    // instead. Either error is acceptable; assert the shared prefix.
    await rejects(() => readCliVersion(path), /version:/);
  }));

Deno.test("readCliVersion: throws when version field is missing", () =>
  withTempDir(async (dir) => {
    const path = join(dir, "deno.json");
    await writeFile(path, JSON.stringify({ name: "x" }));
    await rejects(() => readCliVersion(path), /no non-empty string "version"/);
  }));

Deno.test("readCliVersion: throws when version field is empty", () =>
  withTempDir(async (dir) => {
    const path = join(dir, "deno.json");
    await writeFile(path, JSON.stringify({ version: "" }));
    await rejects(() => readCliVersion(path), /no non-empty string "version"/);
  }));

Deno.test("readCliVersion: throws when version field is not a string", () =>
  withTempDir(async (dir) => {
    const path = join(dir, "deno.json");
    await writeFile(path, JSON.stringify({ version: 1.7 }));
    await rejects(() => readCliVersion(path), /no non-empty string "version"/);
  }));
