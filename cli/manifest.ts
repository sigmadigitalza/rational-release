/**
 * @module
 *
 * Read and write a version field in a JSON manifest (deno.json,
 * package.json, jsr.json, etc.) addressed by a JSONPath-lite expression.
 *
 * Only `$.foo.bar.baz` dot-paths are supported — no array indices,
 * filters, or wildcards. Version fields in the wild are top-level
 * (`$.version`); the dotted-path form is here for forward-compatibility.
 */

import { readFile, writeFile } from "node:fs/promises";

const PATH_RE = /^\$(?:\.[a-zA-Z_][a-zA-Z0-9_-]*)+$/;

function splitPath(jsonpath: string): string[] {
  if (!PATH_RE.test(jsonpath)) {
    throw new Error(
      `Unsupported JSONPath: ${jsonpath}. Use a dot-path like $.version or $.foo.bar.`,
    );
  }
  return jsonpath.slice(2).split(".");
}

/**
 * Read a string value from a parsed JSON manifest at a JSONPath-lite
 * dot-path. Throws if the path is unsupported, missing, or points at
 * a non-string value.
 *
 * @example
 * ```ts
 * readVersion({ version: "1.2.3" }, "$.version");          // "1.2.3"
 * readVersion({ pkg: { v: "0.1.0" } }, "$.pkg.v");        // "0.1.0"
 * ```
 */
export function readVersion(
  // deno-lint-ignore no-explicit-any
  manifest: any,
  jsonpath: string,
): string {
  const keys = splitPath(jsonpath);
  let cur = manifest;
  for (const key of keys) {
    if (cur == null || typeof cur !== "object") {
      throw new Error(`JSONPath ${jsonpath}: cannot descend into ${key}`);
    }
    cur = cur[key];
  }
  if (typeof cur !== "string") {
    throw new Error(
      `JSONPath ${jsonpath}: expected string, got ${typeof cur}`,
    );
  }
  return cur;
}

/**
 * Return a copy of `manifest` with the value at `jsonpath` set to
 * `version`. The spine of the path is shallow-cloned so the input is
 * not mutated. Throws if the path is unsupported or descends into a
 * non-object.
 */
export function writeVersion(
  // deno-lint-ignore no-explicit-any
  manifest: any,
  jsonpath: string,
  version: string,
  // deno-lint-ignore no-explicit-any
): any {
  const keys = splitPath(jsonpath);
  // Shallow clone the spine of the path so we don't mutate the caller's object.
  const root = Array.isArray(manifest) ? [...manifest] : { ...manifest };
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (cur[key] == null || typeof cur[key] !== "object") {
      throw new Error(`JSONPath ${jsonpath}: cannot descend into ${key}`);
    }
    cur[key] = Array.isArray(cur[key]) ? [...cur[key]] : { ...cur[key] };
    cur = cur[key];
  }
  cur[keys[keys.length - 1]] = version;
  return root;
}

/**
 * Read a version string from a JSON manifest file at `path`. Convenience
 * wrapper around {@link readVersion} that handles the file IO.
 */
export async function readManifestVersion(
  path: string,
  jsonpath: string,
): Promise<string> {
  const text = await readFile(path, "utf-8");
  return readVersion(JSON.parse(text), jsonpath);
}

/**
 * Update the version field in a JSON manifest, preserving 2-space
 * indentation and trailing newline. Returns true if the file changed.
 */
export async function writeManifestVersion(
  path: string,
  jsonpath: string,
  version: string,
): Promise<boolean> {
  const text = await readFile(path, "utf-8");
  const parsed = JSON.parse(text);
  const current = readVersion(parsed, jsonpath);
  if (current === version) return false;
  const updated = writeVersion(parsed, jsonpath, version);
  const trailing = text.endsWith("\n") ? "\n" : "";
  await writeFile(path, JSON.stringify(updated, null, 2) + trailing);
  return true;
}
