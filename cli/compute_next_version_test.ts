import { deepStrictEqual as eq, rejects } from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeNextVersion } from "./compute_next_version.ts";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "rr-compute-next-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

Deno.test("computeNextVersion: feat: → minor bump from a fresh manifest", () =>
  withTempDir(async (dir) => {
    const manifest = join(dir, "deno.json");
    const commits = join(dir, "commits.txt");
    await writeFile(manifest, JSON.stringify({ version: "1.2.3" }));
    await writeFile(commits, "feat: add widget\nchore: tidy\n");
    const res = await computeNextVersion({
      manifestPath: manifest,
      commitsFile: commits,
    });
    eq(res, { current: "1.2.3", next: "1.3.0", bumped: true });
  }));

Deno.test("computeNextVersion: fix: → patch bump", () =>
  withTempDir(async (dir) => {
    const manifest = join(dir, "deno.json");
    const commits = join(dir, "commits.txt");
    await writeFile(manifest, JSON.stringify({ version: "1.2.3" }));
    await writeFile(commits, "fix: null guard\n");
    const res = await computeNextVersion({
      manifestPath: manifest,
      commitsFile: commits,
    });
    eq(res, { current: "1.2.3", next: "1.2.4", bumped: true });
  }));

Deno.test("computeNextVersion: docs-only commits → no bump", () =>
  withTempDir(async (dir) => {
    const manifest = join(dir, "deno.json");
    const commits = join(dir, "commits.txt");
    await writeFile(manifest, JSON.stringify({ version: "1.2.3" }));
    await writeFile(commits, "docs: typo\nchore: deps\n");
    const res = await computeNextVersion({
      manifestPath: manifest,
      commitsFile: commits,
    });
    eq(res, { current: "1.2.3", next: "1.2.3", bumped: false });
  }));

Deno.test("computeNextVersion: empty commits file → no bump", () =>
  withTempDir(async (dir) => {
    const manifest = join(dir, "deno.json");
    const commits = join(dir, "commits.txt");
    await writeFile(manifest, JSON.stringify({ version: "1.2.3" }));
    await writeFile(commits, "");
    const res = await computeNextVersion({
      manifestPath: manifest,
      commitsFile: commits,
    });
    eq(res.bumped, false);
  }));

Deno.test("computeNextVersion: feat!: → major (no pre-1.0 cap)", () =>
  withTempDir(async (dir) => {
    const manifest = join(dir, "deno.json");
    const commits = join(dir, "commits.txt");
    await writeFile(manifest, JSON.stringify({ version: "1.2.3" }));
    await writeFile(commits, "feat!: rewrite\n");
    const res = await computeNextVersion({
      manifestPath: manifest,
      commitsFile: commits,
    });
    eq(res.next, "2.0.0");
  }));

Deno.test("computeNextVersion: feat!: with pre-1.0 cap on 0.x → minor", () =>
  withTempDir(async (dir) => {
    const manifest = join(dir, "deno.json");
    const commits = join(dir, "commits.txt");
    await writeFile(manifest, JSON.stringify({ version: "0.7.0" }));
    await writeFile(commits, "feat!: rewrite\n");
    const res = await computeNextVersion({
      manifestPath: manifest,
      commitsFile: commits,
      pre1Cap: true,
    });
    eq(res.next, "0.8.0");
  }));

Deno.test("computeNextVersion: --patch-types fold refactor into patch", () =>
  withTempDir(async (dir) => {
    const manifest = join(dir, "deno.json");
    const commits = join(dir, "commits.txt");
    await writeFile(manifest, JSON.stringify({ version: "1.2.3" }));
    await writeFile(commits, "refactor: reshuffle\n");
    const res = await computeNextVersion({
      manifestPath: manifest,
      commitsFile: commits,
      patchTypes: ["refactor"],
    });
    eq(res.next, "1.2.4");
  }));

Deno.test("computeNextVersion: throws when manifest version is empty", () =>
  withTempDir(async (dir) => {
    const manifest = join(dir, "deno.json");
    const commits = join(dir, "commits.txt");
    await writeFile(manifest, JSON.stringify({ version: "" }));
    await writeFile(commits, "feat: x\n");
    await rejects(
      () =>
        computeNextVersion({
          manifestPath: manifest,
          commitsFile: commits,
        }),
      /Manifest version at .* is empty/,
    );
  }));

Deno.test("computeNextVersion: custom jsonpath", () =>
  withTempDir(async (dir) => {
    const manifest = join(dir, "pkg.json");
    const commits = join(dir, "commits.txt");
    await writeFile(
      manifest,
      JSON.stringify({ meta: { version: "0.4.0" } }),
    );
    await writeFile(commits, "feat: x\n");
    const res = await computeNextVersion({
      manifestPath: manifest,
      jsonPath: "$.meta.version",
      commitsFile: commits,
    });
    eq(res, { current: "0.4.0", next: "0.5.0", bumped: true });
  }));
