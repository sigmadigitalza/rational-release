# Agent notes for rational-release

Start here:
- `README.md`
- `docs/index.html`
- `docs/tutorial.html`
- `docs/advanced.html`

## What this repo is

`rational-release` is a Deno-based CLI plus reusable GitHub Actions workflows for trunk-based releases:
- validate PR titles/commits
- prepare a release PR
- cut/tag/publish a release

## Repo layout

- `cli/` — CLI implementation
- `.github/workflows/` — reusable workflows + self-dogfooding wrappers
- `docs/` — static docs site + workflow examples
- `README.md` — top-level usage and workflow input reference

## Common commands

Run from repo root:
- `deno task ci` — lint + type-check + tests
- `deno task lint`
- `deno task check`
- `deno task test`

CLI entrypoint:
- `deno run --allow-read --allow-write --allow-run --allow-env cli/mod.ts <subcommand>`

## Conventions

- Keep docs and examples aligned with workflow inputs/defaults in:
  - `.github/workflows/prepare-release.yml`
  - `.github/workflows/cut-release.yml`
  - `.github/workflows/validate-pr.yml`
- Keep docs voice direct and practical.
- Prefer explicit file paths in examples.

## Areas to avoid changing casually

- Reusable workflow input names/defaults (public contract).
- Release/changelog format unless explicitly requested.
