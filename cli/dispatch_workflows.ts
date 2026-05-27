/**
 * @module
 *
 * Trigger named workflows on a given ref via `gh workflow run`. Used
 * by prepare-release's optional `post-push-workflows` input to
 * re-trigger PR checks that don't fire on bot-authored release
 * branches (GITHUB_TOKEN pushes are suppressed from `push` and
 * `pull_request` events to prevent recursive workflow runs;
 * `workflow_dispatch` is the documented exception).
 */

import { defaultGhRunner, type GhRunner } from "./gh.ts";

/** Inputs to {@link dispatchWorkflows}. */
export interface DispatchOptions {
  /** Newline-separated workflow names. Blank lines + `#` comments skipped. */
  workflows: string;
  /** Git ref the dispatched runs target. */
  ref: string;
  /** `gh` runner injection for tests. */
  ghRunner?: GhRunner;
}

/** Per-workflow action result. */
export interface DispatchAction {
  name: string;
}

/** Result of {@link dispatchWorkflows}. */
export interface DispatchResult {
  /** Successfully invoked. */
  dispatched: DispatchAction[];
  /** Invocation failed (workflow doesn't exist, no workflow_dispatch trigger, etc). */
  failed: (DispatchAction & { error: string })[];
}

/**
 * Parse a newline-separated workflow list. Trims surrounding
 * whitespace, skips empty lines, skips lines whose first non-space
 * character is `#` (so callers can annotate the list inline).
 */
export function parseWorkflowList(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    out.push(trimmed);
  }
  return out;
}

/**
 * Strip backticks from a name before rendering inside a Markdown
 * inline-code span on `$GITHUB_STEP_SUMMARY`.
 */
export function safeName(name: string): string {
  return name.replaceAll("`", "");
}

/**
 * Dispatch each named workflow against `ref`. Failures are recorded
 * in `failed[]` (caller emits warnings) rather than aborting — the
 * release PR is opened either way; a missing dispatch leaves a
 * missing status check that a human can re-trigger manually.
 */
export async function dispatchWorkflows(
  opts: DispatchOptions,
): Promise<DispatchResult> {
  const names = parseWorkflowList(opts.workflows);
  const gh = opts.ghRunner ?? defaultGhRunner;
  const dispatched: DispatchAction[] = [];
  const failed: (DispatchAction & { error: string })[] = [];

  for (const name of names) {
    const result = await gh([
      "workflow",
      "run",
      name,
      "--ref",
      opts.ref,
    ]);
    if (result.ok) {
      dispatched.push({ name });
    } else {
      failed.push({ name, error: result.stderr.trim() });
    }
  }
  return { dispatched, failed };
}
