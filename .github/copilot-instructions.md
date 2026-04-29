# Copilot instructions for rational-release

Pair this file with:
- `README.md`
- `docs/index.html`
- `docs/tutorial.html`
- `docs/advanced.html`

## Project snapshot

This repo provides reusable GitHub Actions workflows and a Deno CLI for release automation.

Key paths:
- `cli/` — TypeScript CLI
- `.github/workflows/` — reusable workflows and wrappers
- `docs/` — static docs site and examples

## Before proposing changes

1. Cross-check docs against workflow inputs/defaults in `.github/workflows/*.yml`.
2. Keep wording aligned with existing style: short, practical, direct.
3. Avoid duplicating docs across files; link to canonical docs instead.

## Validation

Use existing commands:
- `deno task ci`

## Guardrails

- Do not rename workflow inputs unless explicitly requested.
- Keep examples runnable and explicit.
