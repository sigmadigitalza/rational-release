# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- add `version` subcommand (#49 by @Pushplaybang)

### Changed

- extract release-merge / supersede / dispatch bash into CLI (#46 by @Pushplaybang)
- extract remaining workflow bash into CLI subcommands (#47 by @Pushplaybang)
- comment cleanup + collapse compute-next-version + extract --fallback (#48 by @Pushplaybang)

## [1.7.0] - 2026-05-26

### Added

- post-push-workflows input to re-trigger required checks on bot-authored release PRs (#43 by @Pushplaybang)

### Changed

- bump SHA-pinned actions to Node 24-compatible versions (#44 by @Pushplaybang)

## [1.6.1] - 2026-05-24

### Changed

- add CODEOWNERS — sole owner @Pushplaybang (#42 by @Pushplaybang)

### Fixed

- supersede stale release PRs when bump tier escalates (#40 by @Pushplaybang)

## [1.6.0] - 2026-05-19

### Added

- expose programmatic API at ./lib and audit JSDoc for docs (#38 by @Pushplaybang)

### Changed

- add links to readme (#35 by @Pushplaybang)

## [1.5.0] - 2026-05-19

### Added

- configurable patch-types / minor-types for custom bump tiers (#36 by @Pushplaybang)

## [1.4.3] - 2026-05-04

### Fixed

- skip when triggering commit is a release-merge (#33 by @Pushplaybang)

## [1.4.2] - 2026-05-02

### Fixed

- fetch tags explicitly on prepare/cut checkout (#31 by @Pushplaybang)

## [1.4.1] - 2026-05-02

### Fixed

- force-update floating major-version tag on every cut (#29 by @Pushplaybang)

## [1.4.0] - 2026-05-02

### Added

- extract workflow bash into tested CLI subcommands (#26 by @Pushplaybang)

### Changed

- Complete missing README input purpose docs for reusable workflows (#25)

### Fixed

- unbreak prepare-release fmt check; document Copilot allowlist (#27 by @Pushplaybang)

## [1.3.2] - 2026-05-01

### Fixed

- use jq for manifest read; add workflow_dispatch break-glass (#23 by @Pushplaybang)

## [1.3.1] - 2026-05-01

### Changed

- tighten doc accuracy and add baseline contributor/security/agent guidance (#19)
- add caching, timeouts, concurrency guards, and persist-credentials hardening (#22)

### Fixed

- harden publish trigger + add permissions to self-validate (#20 by @Pushplaybang)

## [1.3.0] - 2026-04-28

### Added

- --next-version attributes pre-tag commits to upcoming release (#17 by @Pushplaybang)

### Changed

- JSR-source the CLI + rename dogfood wrappers to self-* (#16 by @Pushplaybang)

## [1.2.0] - 2026-04-28

### Added

- dogfood CLI in own workflows + bootstrap docs changelog (#14 by @Pushplaybang)

## [1.1.0] - 2026-04-28

### Added

- multi-runtime CLI (Node/Bun) + hand-rolled docs site (#11 by @Pushplaybang)

## [1.0.0] - 2026-04-28

### Added

- graduate to stable 1.0 (#9 by @Pushplaybang)

## [0.3.0] - 2026-04-28

### Added

- auto-bootstrap CHANGELOG.md + document publish-trigger pattern (#7 by @Pushplaybang)

## [0.2.1] - 2026-04-28

### Fixed

- UTC-normalise PR mergedAt date filter (#3 by @Pushplaybang)
- handle release-in-flight + auto-trigger publish (#5 by @Pushplaybang)

## [0.2.0] - 2026-04-28

### Added

- dogfood reusable release workflows on self (#1 by @Pushplaybang)

### Fixed

- UTC-normalise PR mergedAt date filter (#3 by @Pushplaybang)

