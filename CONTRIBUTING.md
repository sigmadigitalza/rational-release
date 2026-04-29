# Contributing

Thanks for taking a swing at `rational-release`.

## Local setup

Requirements:
- Deno v2.x

From repo root:

```bash
deno task ci
```

That runs lint, type-check, and tests for the CLI.

## Making changes

1. Keep workflow input names/defaults stable unless the change is intentional and documented.
2. If you change behavior, update:
   - `README.md`
   - matching docs page(s) in `docs/`
   - examples in `docs/examples/` when relevant
3. Prefer small, focused PRs.

## Pull requests

- Use conventional-commit-style titles when possible (`feat: ...`, `fix: ...`, etc.).
- Include tests for behavior changes in `cli/*_test.ts`.
- Run `deno task ci` before opening/updating the PR.
