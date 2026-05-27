/**
 * @module
 *
 * Shared `gh` CLI subprocess wrapper for the release-tooling modules
 * (`detect_release_merge`, `supersede_stale`, `dispatch_workflows`).
 * Returns a structured result instead of throwing on non-zero exit so
 * callers can decide per-call whether a failure is fatal.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Result of one `gh` invocation. `ok` is true iff exit code was 0. */
export interface GhResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/** Pluggable runner for tests. Production uses `gh` via subprocess. */
export type GhRunner = (args: readonly string[]) => Promise<GhResult>;

/** Run `gh` with the given args and return stdout/stderr without throwing. */
export const defaultGhRunner: GhRunner = async (args) => {
  try {
    const { stdout, stderr } = await execFileAsync("gh", [...args], {
      encoding: "utf-8",
    });
    return { ok: true, stdout, stderr };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? e.message ?? "",
    };
  }
};
