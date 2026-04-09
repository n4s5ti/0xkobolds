# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.4.0] - 2026-04-09

### Fixed

- **learn_reason_now**: Was a stub that just returned stats. Now fetches unprocessed observations, runs them through the reasoning engine, saves conclusions with embeddings, marks observations as processed, and auto-generates session summaries.

- **ReasoningEngine.processQueue**: Was discarding reason() results. Added onConclusions callback that saves conclusions + embeddings to the store when the background queue processes messages.

- **Observation → Reasoning bridge**: Observations stored via learn_add_observation with processed=false were never picked up. learn_reason_now now bridges this gap by calling reasoningEngine.reasonOnObservations().

- **searchSimilar (vector search)**: Was using keyword-only fallback even when embeddings existed. Now generates query embedding via Ollama and uses cosineSimilarity() for actual vector search, with keyword fallback when embeddings are unavailable.

- **Session summarization**: SHORT_SUMMARY_INTERVAL (20) and LONG_SUMMARY_INTERVAL (60) were defined but never used. Added contextAssembler.autoSummarize() which generates short and long summaries when message count thresholds are exceeded. Called automatically after reasoning.

### Added

- `ReasonedConclusion` type — structured conclusion with embedding
- `reasonOnObservations()` on ReasoningEngine — bridge from observations to reasoning
- `autoSummarize()` on ContextAssembler — generates summaries at message thresholds
- `getQueryEmbedding()` on ContextAssembler — generates embedding for search queries

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
