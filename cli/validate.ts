/**
 * Validate a PR title against the conventional-commits spec.
 *
 * Outputs a JSON verdict to stdout:
 *
 *     { "ok": true|false, "reason": "...", "parsed": {...}|null }
 *
 * Used by the reusable validate-pr.yml workflow so the validation
 * logic lives in the CLI rather than in an inline script.
 */

import { parseSubject } from "./conventional.ts";

export interface ValidateResult {
  ok: boolean;
  reason: string;
  parsed: ReturnType<typeof parseSubject>;
}

export function validateTitle(
  title: string,
  allowedTypes: string[],
  requireScope: boolean,
): ValidateResult {
  const allowed = new Set(allowedTypes.map((s) => s.trim()));
  const parsed = parseSubject(title);
  if (!parsed) {
    return {
      ok: false,
      reason: "Title does not match `type(scope)?!?: description`.",
      parsed,
    };
  }
  if (!allowed.has(parsed.type)) {
    return {
      ok: false,
      reason:
        `Type \`${parsed.type}\` is not in the allowed list (${allowedTypes.join(",")}).`,
      parsed,
    };
  }
  if (requireScope && !parsed.scope) {
    return {
      ok: false,
      reason: "Scope is required (`type(scope): ...`).",
      parsed,
    };
  }
  return { ok: true, reason: "", parsed };
}
