/**
 * @module
 *
 * Read the rational-release CLI's own published version from its
 * colocated `deno.json`. Used by the `version` subcommand so consumers
 * can introspect which release they pinned (e.g. for issue reports or
 * conditional behaviour against a minimum version).
 *
 * The function is permission-free at the library boundary: callers
 * either pass an explicit path (the unit tests do this) or rely on the
 * default that resolves `../deno.json` relative to this module's URL.
 * In a JSR-published bundle that lands on the package's own manifest;
 * in a local checkout it lands on the repo's `deno.json`.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/** Default location of the CLI's own `deno.json` (one directory up). */
export const DEFAULT_DENO_JSON_PATH: string = join(
  MODULE_DIR,
  "..",
  "deno.json",
);

/**
 * Read the `version` field from a Deno-style manifest and return it.
 *
 * Throws with an actionable message when the file is missing, the JSON
 * is malformed, or the `version` field is absent / non-string / empty.
 * The default path resolves to the rational-release package's own
 * `deno.json`; pass an explicit path in tests.
 */
export async function readCliVersion(
  denoJsonPath: string = DEFAULT_DENO_JSON_PATH,
): Promise<string> {
  let text: string;
  try {
    text = await readFile(denoJsonPath, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`version: failed to read ${denoJsonPath}: ${msg}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`version: ${denoJsonPath} is not valid JSON: ${msg}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`version: ${denoJsonPath} is not a JSON object`);
  }
  const version = (parsed as { version?: unknown }).version;
  if (typeof version !== "string" || version === "") {
    throw new Error(
      `version: ${denoJsonPath} has no non-empty string "version" field`,
    );
  }
  return version;
}
