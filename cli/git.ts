/**
 * @module
 *
 * Shared `git` subprocess wrapper for the release-tooling modules
 * (`prev_tag`, `collect_commits`, `stage_prep`, `force_push`).
 * Returns a structured result so callers can decide per-call whether
 * a failure is fatal (parallel to `./gh.ts`).
 *
 * Always invokes `git --no-pager` so commands like `git log` never
 * page interactively in non-TTY workflow contexts.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Result of one `git` invocation. */
export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/** Pluggable runner for tests. Production uses `git` via subprocess. */
export type GitRunner = (args: readonly string[]) => Promise<GitResult>;

/** Run `git --no-pager` with the given args and return result. */
export const defaultGitRunner: GitRunner = async (args) => {
  try {
    const { stdout, stderr } = await execFileAsync(
      "git",
      ["--no-pager", ...args],
      { encoding: "utf-8" },
    );
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
