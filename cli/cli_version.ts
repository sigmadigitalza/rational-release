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
import { fileURLToPath } from "node:url";

/**
 * Resolve the location of the CLI's own `deno.json` (one directory up
 * from `moduleUrl`).
 *
 * Converts to a filesystem path only when `moduleUrl` is a `file:` URL
 * (a local checkout). When the CLI is loaded over http(s) — e.g. via
 * `jsr:`, the default way consumers run it — `import.meta.url` is an
 * `https:` URL and `fileURLToPath` throws "The URL must be of scheme
 * file". Because this resolution previously ran at module top-level,
 * that threw on import and crashed *every* subcommand. Keeping the href
 * for non-`file:` URLs lets the module load; only the `version`
 * subcommand reads this path, so it degrades to a clear runtime error
 * there instead of taking the whole CLI down.
 *
 * Exported so both schemes can be unit-tested directly.
 */
export function resolveDenoJsonPath(moduleUrl: string): string {
  const denoJsonUrl = new URL("../deno.json", moduleUrl);
  return denoJsonUrl.protocol === "file:"
    ? fileURLToPath(denoJsonUrl)
    : denoJsonUrl.href;
}

/** Default location of the CLI's own `deno.json` (one directory up). */
export const DEFAULT_DENO_JSON_PATH: string = resolveDenoJsonPath(
  import.meta.url,
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
