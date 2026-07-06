# rational-release

Reusable GitHub Actions workflows + a small Deno CLI for trunk-based,
conventional-commit-driven releases with a release-PR gate.

- [GitHub Repo](https://github.com/sigmadigitalza/rational-release)
- [Website](https://sigmadigital.io/rational-release/)
- [Published on JSR](https://jsr.io/@sigmadigitalza/rational-release)

Designed for Deno projects that want the shape of [release-please](https://github.com/googleapis/release-please)
but with the prepare commit fully under their control — re-build a search index,
mirror the changelog into a docs page, run tests as a gate, attach custom artefacts,
without leaving GitHub Actions.

## What it does

```text
  ┌───────────────┐    ┌─────────────────┐    ┌──────────────┐
  │ Validate PR   │ →  │ Prepare Release │ →  │ Cut Release  │
  └───────────────┘    └─────────────────┘    └──────────────┘
   conv-commits         test/lint/build         tag + GitHub Release
   PR-title check       force-push release/v…   custom artefacts
   (report or gate)     open/update release PR  release notes from CHANGELOG
```

Three reusable workflows, called via `workflow_call`:

- **`prepare-release.yml`** — fires on every push to `main`. Computes the next
  semver from conventional-commit subjects since the previous tag, regenerates
  the `[Unreleased]` section of `CHANGELOG.md` from merged PR titles, finalises
  it into the `[X.Y.Z] - date` release section, applies the version bump to
  your manifest, force-pushes a `release/vX.Y.Z` branch, and opens/updates a
  "Release vX.Y.Z" PR. Because the changelog is finalised inside the release
  PR, merging it is the only write to `main` — the flow works unchanged on
  protected branches.
- **`cut-release.yml`** — fires when a `release/v*` PR is merged. Tags
  `vX.Y.Z`, runs your `artefact-task`, and creates a GitHub Release with the
  changelog section as the body and the artefacts attached. (It can still
  finalise the changelog itself as a fallback for release branches prepped by
  an older `prepare-release` — that path needs push access to `main`.)
- **`validate-pr.yml`** — fires on `pull_request`. Validates the PR title and
  every commit message in the PR against the conventional-commits spec.
  Report-only by default; opt-in to gating with `gate: true`.

## Quick start

Drop three thin wrapper workflows into your repo. See [`docs/examples/`](docs/examples/)
for ready-to-paste copies; the minimum for a Deno project is roughly:

```yaml
# .github/workflows/prepare-release.yml
on: { push: { branches: [main] } }
permissions: { contents: write, pull-requests: write }
jobs:
  prepare:
    uses: sigmadigitalza/rational-release/.github/workflows/prepare-release.yml@v1
    with:
      pre1-cap: true
      pre-tasks: |
        deno task test
```

```yaml
# .github/workflows/cut-release.yml
on: { pull_request: { types: [closed], branches: [main] } }
permissions: { contents: write, pull-requests: read }
jobs:
  cut:
    uses: sigmadigitalza/rational-release/.github/workflows/cut-release.yml@v1
    with:
      artefact-task: deno task package
      artefact-paths: dist/*.tar.gz
```

```yaml
# .github/workflows/validate-pr.yml
on: { pull_request: { types: [opened, edited, synchronize, reopened] } }
jobs:
  title:
    uses: sigmadigitalza/rational-release/.github/workflows/validate-pr.yml@v1
```

Your repo also needs:

- A version field in `deno.json` (or another JSON manifest, addressed via
  `manifest-jsonpath`).
- A `CHANGELOG.md` is created on the first run if missing (Keep-a-Changelog
  format with a `## [Unreleased]` section). Set `bootstrap-changelog: false`
  if you'd rather provide your own.

### Cloud agents and JSR

If you run releases from a cloud agent that operates behind a network
allowlist (GitHub-hosted Copilot agents, sandboxed CI runners, etc.),
make sure the agent can reach `jsr.io` so it can resolve and run the
CLI — the workflows pull it as `jsr:@sigmadigitalza/rational-release`.
On unrestricted GitHub Actions runners this is already the default, so
no change is needed.

### Triggering JSR / npm publish from `cut-release`

Tags pushed by `cut-release` use the default `GITHUB_TOKEN`, and GitHub
intentionally [does not fire downstream `push` workflows][1] from those
tags. A naïve `on: push: tags: [v*]` publish workflow won't run after a
release is cut. Trigger your publish workflow with `workflow_run` on
`Cut Release` completion instead — see [`docs/examples/publish-jsr.yml`](docs/examples/publish-jsr.yml).

`workflow_run` jobs run with repo secrets and (for JSR) `id-token: write`,
so the example derives the version from the triggering branch
(`release/vX.Y.Z`), checks out the freshly-pushed tag, and verifies the
tag matches the manifest before publishing. This avoids the CodeQL
`actions/untrusted-checkout` pattern that fires when a privileged
`workflow_run` checks out `head_sha` directly.

[1]: https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#using-the-github_token-in-a-workflow

## Configuration reference

### `prepare-release.yml`

| Input | Default | Purpose |
|---|---|---|
| `manifest-path` | `deno.json` | JSON file containing the version. |
| `manifest-jsonpath` | `$.version` | JSONPath-lite dot-path (must start with `$.`) inside the manifest. |
| `pre1-cap` | `false` | Treat `feat!:` as `minor` while `0.x.y`. |
| `patch-types` | _(empty)_ | Comma-separated extra commit types to treat as **patch** (e.g. `refactor,build`). Built-in `fix` / `perf` always apply. See [Bump rules](#bump-rules). |
| `minor-types` | _(empty)_ | Comma-separated extra commit types to treat as **minor**. Built-in `feat` always applies. Wins over `patch-types` for the same type. |
| `release-branch-prefix` | `release/v` | Prefix for the release branch name. |
| `pre-tasks` | _(empty)_ | Newline-separated shell commands run before changelog gen. |
| `commit-paths` | _(empty)_ | Newline-separated extra paths to `git add` into the prep commit. |
| `mirror-paths` | _(empty)_ | Newline-separated `src:dst` pairs to copy after changelog generation. |
| `changelog-path` | `CHANGELOG.md` | Path to the canonical changelog. |
| `bootstrap-changelog` | `true` | Auto-create the changelog with a Keep-a-Changelog skeleton if missing. |
| `cli` | `jsr:@sigmadigitalza/rational-release@^1` | CLI source. JSR specifier (default) or local path (`./cli/mod.ts`) for dogfooding. |
| `post-push-workflows` | _(empty)_ | Newline-separated workflow names to dispatch on the release branch after force-push. Use this to re-trigger PR checks that don't fire on bot-authored pushes (anti-loop GitHub Actions suppression — see [`docs/advanced`](docs/advanced.html#post-push-workflows)). Each named workflow must declare a `workflow_dispatch:` trigger. |
| `runs-on` | `ubuntu-latest` | Runner label. |

### `cut-release.yml`

| Input | Default | Purpose |
|---|---|---|
| `manifest-path` | `deno.json` | (Same as above; cross-checked against branch name.) |
| `manifest-jsonpath` | `$.version` | JSONPath-lite dot-path (must start with `$.`) inside the manifest. |
| `release-branch-prefix` | `release/v` | Prefix for the release branch name. Must match the hardcoded `release/v` job gate in the workflow. |
| `changelog-path` | `CHANGELOG.md` | Path to the canonical changelog. |
| `mirror-paths` | _(empty)_ | Newline-separated `src:dst` pairs to copy after changelog finalisation. |
| `commit-paths` | _(empty)_ | Newline-separated extra paths to `git add` into the finalisation commit. |
| `artefact-task` | _(empty)_ | Shell command(s) run after the tag is created. |
| `artefact-paths` | _(empty)_ | Globs of files to attach to the GitHub Release. |
| `cli` | `jsr:@sigmadigitalza/rational-release@^1` | CLI source. JSR specifier (default) or local path (`./cli/mod.ts`) for dogfooding. |
| `runs-on` | `ubuntu-latest` | Runner label. |

### `validate-pr.yml`

| Input | Default | Purpose |
|---|---|---|
| `require-scope` | `false` | Require `type(scope): …`. |
| `gate` | `false` | Fail the workflow on validation error (vs report-only). |
| `release-branch-prefix` | `release/v` | Head-branch prefix of machine-generated release PRs to skip (their "Release vX.Y.Z" title is by design not conventional). |
| `validate-commits` | `true` | Also validate every commit message in the PR. |
| `cli` | `jsr:@sigmadigitalza/rational-release@^1` | CLI source. JSR specifier (default) or local path (`./cli/mod.ts`) for dogfooding. |
| `runs-on` | `ubuntu-latest` | Runner label. |

## Bump rules

`next-version` walks `git log <prev-tag>..HEAD` and picks the highest bump
across all commit subjects:

- `<type>!:` _or_ `<type>(scope)!:` → **major** (downgraded to minor under
  `pre1-cap`).
- `feat:` → **minor**.
- `fix:` / `perf:` → **patch**.
- Anything else → no bump.

If no commit triggers a bump, `prepare-release` exits early without opening a
PR.

### Opting other types into the patch / minor tier

The defaults above are conservative. A project that frequently ships substantive
`refactor:` or `build:` work — for example, internal reshuffles that move imports
for downstream consumers — can opt those types into a bump tier:

```yaml
# In your wrapper for prepare-release.yml
with:
  patch-types: refactor,build
  minor-types: ""          # opt into minor for types you treat as user-facing
```

The CLI takes the same lists directly:

```sh
rational-release next-version deno.json \
  --commits-file commits.txt \
  --patch-types refactor,build
```

Built-in mappings always win: a `feat:` cannot be downgraded to patch via
`patch-types: feat`, and a `!` on the subject always produces major regardless
of these lists. `minor-types` wins over `patch-types` for the same type.

> **Footers.** Only commit subjects are scanned, not bodies. A
> `BREAKING CHANGE:` footer alone — without a `!` on the subject — will not
> trigger a major bump. Squash-merge with the breaking marker on the squash
> subject if you need this behaviour.

## CLI

The CLI underneath the workflows is also usable directly. It uses only
`node:*` standard-library imports so it runs on Deno, Node, and Bun
without modification. Subcommands:

```text
rational-release next-version       <manifest> [--jsonpath …] [--pre-1.0-cap] [--commits-file FILE]
rational-release read-version       <manifest> [--jsonpath …]
rational-release set-version        <manifest> <version> [--jsonpath …]
rational-release changelog-generate <prs.json> <changelog.md> [--bootstrap]
rational-release changelog-finalise <changelog.md> <version> [--date YYYY-MM-DD]
rational-release extract-section    <changelog.md> <version>
rational-release validate-title     [<title>] [--from-env VAR] [--require-scope]
rational-release validate-commits   [<msg>...] [--commits-file FILE] [--from-env VAR] [--separator SEP]
rational-release build-changelog    [--output PATH] [--format md|html] [--repo OWNER/REPO] [--preserve-from FILE] [--next-version VER] [--next-date YYYY-MM-DD]
```

Once published to JSR:

```sh
# Deno
deno run -A jsr:@sigmadigitalza/rational-release next-version deno.json --commits-file commits.txt

# Node (>=22)
npx jsr run @sigmadigitalza/rational-release next-version package.json --commits-file commits.txt

# Bun
bunx jsr run @sigmadigitalza/rational-release next-version package.json --commits-file commits.txt
```

## Versioning

Tag floats: `@v1` re-points on additive changes; `@v2` will only exist if input
shapes change. Pin to an exact tag (`@v1.2.3`) if you want immutability.

## License

[MIT](LICENSE).

---

Built by [sigmadigital.io](https://sigmadigital.io). Hosted docs at
[sigmadigital.io/rational-release](https://sigmadigital.io/rational-release/).
