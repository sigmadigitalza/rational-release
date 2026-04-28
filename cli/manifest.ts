/**
 * Read and write a version field in a JSON manifest (deno.json,
 * package.json, jsr.json, etc.) addressed by a JSONPath-lite expression.
 *
 * Only `$.foo.bar.baz` dot-paths are supported — no array indices,
 * filters, or wildcards. Version fields in the wild are top-level
 * (`$.version`); the dotted-path form is here for forward-compatibility.
 */

const PATH_RE = /^\$(?:\.[a-zA-Z_][a-zA-Z0-9_-]*)+$/;

function splitPath(jsonpath: string): string[] {
  if (!PATH_RE.test(jsonpath)) {
    throw new Error(
      `Unsupported JSONPath: ${jsonpath}. Use a dot-path like $.version or $.foo.bar.`,
    );
  }
  return jsonpath.slice(2).split(".");
}

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

export async function readManifestVersion(
  path: string,
  jsonpath: string,
): Promise<string> {
  const text = await Deno.readTextFile(path);
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
  const text = await Deno.readTextFile(path);
  const parsed = JSON.parse(text);
  const current = readVersion(parsed, jsonpath);
  if (current === version) return false;
  const updated = writeVersion(parsed, jsonpath, version);
  const trailing = text.endsWith("\n") ? "\n" : "";
  await Deno.writeTextFile(path, JSON.stringify(updated, null, 2) + trailing);
  return true;
}
