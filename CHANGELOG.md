# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2025-03-16

### Added

- Added support for clipboard history

### Changed

- Renamed to "Better Copy/Paste"

## [0.1.0] - 2025-03-15

### Added

- Added support for cutting
- Added limited support for "spread" style multicursor pasting
- Added support for pasting single cursor empty selections on new lines

### Changed

- Paste indentation is now determined by the content of line containing the cursor, instead of the cursor position

## [0.0.4] - 2025-03-12

- Fix incorrect paste when first line is not at the lowest indent level and not all whitespace selected

## [0.0.3] - 2025-03-11

- Fix format on paste

## [0.0.2] - 2025-03-10

- Clarify behavior of tabs vs spaces
- Rename commands to copy-paste-and-indent.*

## [0.0.1] - 2025-03-10

- Initial release
