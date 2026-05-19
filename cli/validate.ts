/**
 * @module
 *
 * Conventional-commit validators for PR titles and commit-message lists.
 *
 * Pure functions — return structured verdicts; the CLI driver renders
 * them to stdout / GITHUB_STEP_SUMMARY and decides exit codes.
 */

import { parseSubject } from "./conventional.ts";

/** Default set of allowed conventional-commit types. */
export const DEFAULT_ALLOWED_TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
];

/** Headers we never validate — tooling-generated bootstrap commits. */
export const DEFAULT_SKIPPED_HEADERS: Set<string> = new Set(["Initial plan"]);

/** Options shared by {@link validateTitle} and {@link validateCommits}. */
export interface ValidateOptions {
  allowedTypes?: string[];
  requireScope?: boolean;
}

/** Result of validating a single PR title. */
export interface TitleVerdict {
  ok: boolean;
  errors: string[];
}

/**
 * Validate a PR title against Conventional Commits. Empty titles, missing
 * type prefixes, unknown types, and (with `requireScope`) missing scopes
 * each produce a structured error rather than an exception.
 *
 * @example
 * ```ts
 * validateTitle("feat: add widget");
 * // { ok: true, errors: [] }
 *
 * validateTitle("update readme");
 * // { ok: false, errors: ["Title does not match `type(scope)?!?: description`."] }
 * ```
 */
export function validateTitle(
  title: string,
  options: ValidateOptions = {},
): TitleVerdict {
  const allowed = new Set(options.allowedTypes ?? DEFAULT_ALLOWED_TYPES);
  const errors: string[] = [];

  const trimmed = title.trim();
  if (!trimmed) {
    errors.push("Title is empty.");
    return { ok: false, errors };
  }

  const parsed = parseSubject(trimmed);
  if (!parsed) {
    errors.push(
      "Title does not match `type(scope)?!?: description`.",
    );
    return { ok: false, errors };
  }

  if (!allowed.has(parsed.type)) {
    errors.push(
      `Unknown type "${parsed.type}". Allowed types: ${
        [...allowed].join(", ")
      }`,
    );
  }

  if (options.requireScope && !parsed.scope) {
    errors.push("Scope is required (`type(scope): description`).");
  }

  return { ok: errors.length === 0, errors };
}

/** Per-commit result inside a {@link CommitsVerdict}. */
export interface CommitResult {
  header: string;
  ok: boolean;
  skipped: boolean;
  errors: string[];
}

/** Aggregate result of validating a list of commit-message headers. */
export interface CommitsVerdict {
  results: CommitResult[];
  passed: number;
  failed: number;
  skipped: number;
}

/**
 * Validate a list of commit-message headers. Merge commits and
 * `DEFAULT_SKIPPED_HEADERS` entries are reported as skipped, not failed.
 *
 * Each input is treated as a full commit message; only the first line
 * (the header) is validated.
 */
export function validateCommits(
  messages: string[],
  options: ValidateOptions & { skipped?: Set<string> } = {},
): CommitsVerdict {
  const skipped = options.skipped ?? DEFAULT_SKIPPED_HEADERS;
  const results: CommitResult[] = [];
  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const raw of messages) {
    const header = raw.split("\n")[0].trim();

    if (header.startsWith("Merge ") || skipped.has(header)) {
      results.push({ header, ok: true, skipped: true, errors: [] });
      skippedCount += 1;
      continue;
    }

    const verdict = validateTitle(header, options);
    if (verdict.ok) {
      passedCount += 1;
    } else {
      failedCount += 1;
    }
    results.push({
      header,
      ok: verdict.ok,
      skipped: false,
      errors: verdict.errors,
    });
  }

  return {
    results,
    passed: passedCount,
    failed: failedCount,
    skipped: skippedCount,
  };
}
