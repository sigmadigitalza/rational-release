# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

