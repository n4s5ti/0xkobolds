# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.2.3] - 2026-04-06

### Changed

- **Internal Refactoring**: Decomposed monolithic `index.ts` into modular architecture
  - `core/config.ts`: Configuration loading with assertions
  - `core/dream.ts`: Dream runner and scheduler
  - `core/project-detection.ts`: File-based project detection
  - `core/commands.ts`: `/learn` command handler
  - `core/bridge.ts`: Standalone MemoryProvider

- **NASA 10 Rules Compliance**: Added `console.assert()` to all exported functions per NASA #5

- **State Encapsulation**: Replaced module-level mutable state with closure pattern (`createExtensionState`)

- **Removed Dependency**: Standalone bridge implementation (no cross-package dependency on pi-orchestration)

## [0.2.2] - 2026-04-03

### Added

- Hybrid memory architecture (global vs project scope)
- Context blending for dual-scope queries
- Project-aware workspace switching

## [0.2.1] - 2026-04-03

### Changed

- Bug fixes and improvements

## [0.2.0] - 2026-04-02

### Added

- Initial release with memory tools
- Ollama integration for embeddings and reasoning
- SQLite storage using sql.js
