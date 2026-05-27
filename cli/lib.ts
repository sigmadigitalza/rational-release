/**
 * @module
 *
 * Programmatic API for rational-release. The CLI in `./mod.ts` is a
 * thin dispatch around these primitives; importing this module gives
 * you the same building blocks for custom release tooling without
 * shelling out to the CLI.
 *
 * The surface is organised into small, single-purpose groups:
 *
 * - **Bump rules** — parse conventional-commit subjects and decide
 *   semver bumps. {@link parseSubject}, {@link subjectToBump},
 *   {@link highestBump}, {@link Bump}, {@link BumpOptions}.
 *
 * - **Version arithmetic** — pure semver math.
 *   {@link parseVersion}, {@link nextVersion}.
 *
 * - **Manifest IO** — read/write the version field in a JSON manifest
 *   addressed by a JSONPath-lite dot-path.
 *   {@link readManifestVersion}, {@link writeManifestVersion}.
 *
 * - **Validators** — check PR titles and commit messages against
 *   Conventional Commits.
 *   {@link validateTitle}, {@link validateCommits}.
 *
 * - **Changelog primitives** — Keep-a-Changelog regen, finalise, and
 *   extract.
 *   {@link bucketPrs}, {@link renderUnreleased},
 *   {@link rewriteUnreleased}, {@link finaliseUnreleased},
 *   {@link extractSection}.
 *
 * - **Release gate** — decide whether prepare-release should open a
 *   release PR. {@link releaseGate}.
 *
 * - **Release-notes tail** — render the "Pull requests in this release"
 *   block appended to GitHub Release bodies.
 *   {@link renderReleaseNotesTail}.
 *
 * - **Branch helpers** — strip a release-branch prefix and validate the
 *   remainder as strict semver. {@link branchVersion}.
 *
 * - **Mirror helpers** — copy files between paths via `src:dst` pairs.
 *   {@link parsePairs}, {@link mirrorPairs}.
 *
 * - **Build-changelog primitives** — render a full
 *   conventional-changelog from git history.
 *   {@link renderMarkdown}, {@link renderHtml}, plus the underlying
 *   classifiers and git-readers.
 *
 * - **Release-tooling primitives** — `gh`-CLI-backed helpers used by
 *   the reusable workflows. {@link detectReleaseMerge} (race guard for
 *   prepare-release vs cut-release), {@link supersedeStale} (close
 *   stale parallel release PRs), {@link dispatchWorkflows} (re-trigger
 *   PR checks on bot-authored release branches). All take an injectable
 *   {@link GhRunner} for testing.
 *
 * **Stability.** This module is the documented programmatic API and
 * follows the same semver contract as the CLI: additive changes ship
 * as a minor; breaking changes require a major or a `!` marker.
 *
 * **Runtime.** Everything in this module uses only `node:*` standard-
 * library imports, so it runs on Deno, Node (>=22), and Bun without
 * modification.
 *
 * @example Compute the next semver from a list of commit subjects
 * ```ts
 * import {
 *   highestBump,
 *   nextVersion,
 * } from "@sigmadigitalza/rational-release/lib";
 *
 * const bump = highestBump(["feat: add widget", "fix: null guard"]);
 * const next = nextVersion("0.7.0", bump, { pre1Cap: true });
 * console.log(next); // "0.8.0"
 * ```
 *
 * @example Treat `refactor:` as a patch-tier commit
 * ```ts
 * import { highestBump } from "@sigmadigitalza/rational-release/lib";
 *
 * const bump = highestBump(
 *   ["refactor: reshuffle modules"],
 *   { patchTypes: ["refactor"] },
 * );
 * console.log(bump); // "patch"
 * ```
 *
 * @example Validate a PR title
 * ```ts
 * import { validateTitle } from "@sigmadigitalza/rational-release/lib";
 *
 * const verdict = validateTitle(
 *   "feat(api): add /v1/status",
 *   { requireScope: true },
 * );
 * if (!verdict.ok) console.error(verdict.errors);
 * ```
 */

// Bump rules
export {
  type Bump,
  type BumpOptions,
  highestBump,
  type ParsedSubject,
  parseSubject,
  subjectToBump,
} from "./conventional.ts";

// Version arithmetic
export { nextVersion, parseVersion } from "./version.ts";

// Manifest IO
export {
  readManifestVersion,
  readVersion,
  writeManifestVersion,
  writeVersion,
} from "./manifest.ts";

// Validators
export {
  type CommitResult,
  type CommitsVerdict,
  DEFAULT_ALLOWED_TYPES,
  DEFAULT_SKIPPED_HEADERS,
  type TitleVerdict,
  validateCommits,
  type ValidateOptions,
  validateTitle,
} from "./validate.ts";

// Changelog primitives
export {
  bootstrapTemplate,
  bucketPrs,
  extractSection,
  finaliseUnreleased,
  type MergedPr,
  renderUnreleased,
  rewriteUnreleased,
} from "./changelog.ts";

// Release gate
export { type GateVerdict, releaseGate } from "./release_gate.ts";

// Release-notes tail — `MergedPr` collides with the changelog one above,
// so alias this one. The shapes differ: this carries an author block,
// the changelog variant doesn't.
export {
  type MergedPr as ReleaseTailMergedPr,
  renderReleaseNotesTail,
  type RenderTailOptions,
} from "./release_notes_tail.ts";

// Branch helpers
export { branchVersion } from "./branch_version.ts";

// Mirror helpers
export { type MirrorPair, mirrorPairs, parsePairs } from "./mirror.ts";

// Build-changelog primitives
export {
  classifyCommit,
  type CommitEntry,
  escapeHtml,
  groupBySection,
  listVersionTags,
  parseGitLogLine,
  parseOriginRepo,
  readCommitsInRange,
  readExistingHistory,
  renderHtml,
  renderMarkdown,
  type RenderOptions,
  runGit,
  SECTION_ORDER,
  tagDate,
  TYPE_TO_SECTION,
} from "./build_changelog.ts";

// gh subprocess wrapper — shared by the release-tooling modules below.
export { defaultGhRunner, type GhResult, type GhRunner } from "./gh.ts";

// Release-merge race guard
export {
  type DetectOptions as DetectReleaseMergeOptions,
  detectReleaseMerge,
  type DetectResult as DetectReleaseMergeResult,
} from "./detect_release_merge.ts";

// Supersede-stale-release-PRs sweep
export {
  filterStale,
  type OpenPr,
  type PrAction,
  safeRef,
  type SupersedeOptions,
  type SupersedeResult,
  supersedeStale,
} from "./supersede_stale.ts";

// Workflow-dispatch helper (post-push re-trigger)
export {
  type DispatchAction,
  type DispatchOptions,
  type DispatchResult,
  dispatchWorkflows,
  parseWorkflowList,
  safeName,
} from "./dispatch_workflows.ts";
