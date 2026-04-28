# rational-release

Reusable GitHub Actions workflows + a small Deno CLI for trunk-based,
conventional-commit-driven releases with a release-PR gate.

Designed for Deno projects that want the shape of [release-please](https://github.com/googleapis/release-please)
but with the prepare commit fully under their control — re-build a search index,
mirror the changelog into a docs page, run tests as a gate, attach custom artefacts,
without leaving GitHub Actions.

## What it does

```
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
  the `[Unreleased]` section of `CHANGELOG.md` from merged PR titles, applies
  the version bump to your manifest, force-pushes a `release/vX.Y.Z` branch,
  and opens/updates a "Release vX.Y.Z" PR.
- **`cut-release.yml`** — fires when a `release/v*` PR is merged. Finalises
  the changelog (`[Unreleased]` → `[X.Y.Z] - date`), tags `vX.Y.Z`, runs your
  `artefact-task`, and creates a GitHub Release with the changelog section as
  the body and the artefacts attached.
- **`validate-pr.yml`** — fires on `pull_request`. Validates the PR title against
  the conventional-commits spec. Report-only by default; opt-in to gating.

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
CLI. For pinned-tag usage you'll also want `raw.githubusercontent.com`.
On unrestricted GitHub Actions runners this is already the default, so
no change is needed.

### Triggering JSR / npm publish from `cut-release`

Tags pushed by `cut-release` use the default `GITHUB_TOKEN`, and GitHub
intentionally [does not fire downstream `push` workflows][1] from those
tags. A naïve `on: push: tags: [v*]` publish workflow won't run after a
release is cut. Trigger your publish workflow with `workflow_run` on
`Cut Release` completion instead — see [`docs/examples/publish-jsr.yml`](docs/examples/publish-jsr.yml).

[1]: https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#using-the-github_token-in-a-workflow

## Configuration reference

### `prepare-release.yml`

| Input | Default | Purpose |
|---|---|---|
| `manifest-path` | `deno.json` | JSON file containing the version. |
| `manifest-jsonpath` | `$.version` | Dot-path inside the manifest. |
| `pre1-cap` | `false` | Treat `feat!:` as `minor` while `0.x.y`. |
| `release-branch-prefix` | `release/v` | Prefix for the release branch name. |
| `pre-tasks` | _(empty)_ | Newline-separated shell commands run before changelog gen. |
| `commit-paths` | _(empty)_ | Extra paths to `git add` into the prep commit. |
| `mirror-paths` | _(empty)_ | `src:dst` pairs to copy after changelog generation. |
| `changelog-path` | `CHANGELOG.md` | Path to the canonical changelog. |
| `bootstrap-changelog` | `true` | Auto-create the changelog with a Keep-a-Changelog skeleton if missing. |
| `base-ref` | `v1` | Tag/branch of this repo to source the CLI from. |
| `runs-on` | `ubuntu-latest` | Runner label. |

### `cut-release.yml`

| Input | Default | Purpose |
|---|---|---|
| `manifest-path` | `deno.json` | (Same as above; cross-checked against branch name.) |
| `manifest-jsonpath` | `$.version` | |
| `release-branch-prefix` | `release/v` | |
| `changelog-path` | `CHANGELOG.md` | |
| `mirror-paths` | _(empty)_ | |
| `commit-paths` | _(empty)_ | |
| `artefact-task` | _(empty)_ | Shell command(s) run after the tag is created. |
| `artefact-paths` | _(empty)_ | Globs of files to attach to the GitHub Release. |
| `base-ref` | `v1` | |
| `runs-on` | `ubuntu-latest` | |

### `validate-pr.yml`

| Input | Default | Purpose |
|---|---|---|
| `allowed-types` | `feat,fix,docs,style,refactor,perf,test,build,ci,chore,revert` | Comma-separated list of permitted commit types. |
| `require-scope` | `false` | Require `type(scope): …`. |
| `gate` | `false` | Fail the workflow on invalid title (vs report-only). |
| `base-ref` | `v1` | |
| `runs-on` | `ubuntu-latest` | |

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

> **Footers.** Only commit subjects are scanned, not bodies. A
> `BREAKING CHANGE:` footer alone — without a `!` on the subject — will not
> trigger a major bump. Squash-merge with the breaking marker on the squash
> subject if you need this behaviour.

## CLI

The CLI underneath the workflows is also usable directly. It uses only
`node:*` standard-library imports so it runs on Deno, Node, and Bun
without modification. Subcommands:

```
rational-release next-version       <manifest> [--jsonpath …] [--pre-1.0-cap] [--commits-file FILE]
rational-release read-version       <manifest> [--jsonpath …]
rational-release set-version        <manifest> <version> [--jsonpath …]
rational-release changelog-generate <prs.json> <changelog.md> [--bootstrap]
rational-release changelog-finalise <changelog.md> <version> [--date YYYY-MM-DD]
rational-release extract-section    <changelog.md> <version>
rational-release changelog-html     <changelog.md> <output.html>
rational-release validate-title     <title> [--allowed-types …] [--require-scope]
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

Built by [Sigma Digital](https://sigmadigital.io).
