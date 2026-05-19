/**
 * Parse a single conventional-commit subject line into its parts.
 *
 * Returns null for non-conventional input (no type prefix). Subjects of
 * the form `type(scope)!: description` and `type: description` both
 * parse; type is lower-cased.
 *
 * Only the subject is inspected — `BREAKING CHANGE:` footers in commit
 * bodies are not visible here. Pass --format=%B and adapt if you need
 * footer parsing.
 */
export interface ParsedSubject {
  type: string;
  scope: string | null;
  breaking: boolean;
  description: string;
}

const SUBJECT_RE = /^([a-z]+)(?:\(([^)]+)\))?(!)?\s*:\s*(.+)$/i;

export function parseSubject(subject: string): ParsedSubject | null {
  const m = subject.trim().match(SUBJECT_RE);
  if (!m) return null;
  return {
    type: m[1].toLowerCase(),
    scope: m[2] ?? null,
    breaking: m[3] === "!",
    description: m[4].trim(),
  };
}

export type Bump = "major" | "minor" | "patch" | "none";

const BUMP_RANK: Record<Bump, number> = {
  none: 0,
  patch: 1,
  minor: 2,
  major: 3,
};

/**
 * Optional per-project overrides for the bump map. Types listed here are
 * promoted into the named tier *in addition to* the built-in defaults
 * (`feat` → minor; `fix`, `perf` → patch). Built-in mappings always win,
 * and a built-in `!` always produces a major regardless of these lists.
 */
export interface BumpOptions {
  patchTypes?: string[];
  minorTypes?: string[];
}

/**
 * Determine the semver bump implied by a single conventional-commit subject.
 *
 * - Breaking indicator (`!` before `:`) → major
 * - `feat`            → minor
 * - `fix` or `perf`   → patch
 * - Any type listed in `options.minorTypes` → minor
 * - Any type listed in `options.patchTypes` → patch
 * - Anything else (docs, chore, ci, refactor, style, test, build, revert,
 *   non-conventional) → none
 */
export function subjectToBump(
  subject: string,
  options: BumpOptions = {},
): Bump {
  const parsed = parseSubject(subject);
  if (!parsed) return "none";
  if (parsed.breaking) return "major";
  switch (parsed.type) {
    case "feat":
      return "minor";
    case "fix":
    case "perf":
      return "patch";
  }
  if (options.minorTypes?.includes(parsed.type)) return "minor";
  if (options.patchTypes?.includes(parsed.type)) return "patch";
  return "none";
}

/** Highest bump across many subjects. */
export function highestBump(
  subjects: string[],
  options: BumpOptions = {},
): Bump {
  let highest: Bump = "none";
  for (const s of subjects) {
    const bump = subjectToBump(s, options);
    if (BUMP_RANK[bump] > BUMP_RANK[highest]) highest = bump;
  }
  return highest;
}
