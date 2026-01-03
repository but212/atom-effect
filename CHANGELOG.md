# Changelog

## [0.2.0] - 2026-01-04

### Changed - 0.2.0

This major minor release introduces significant internal optimizations.

- **Performance**
  - **Zero-Allocation**: Replaced `Set` with Pooled `Array`s for dependency tracking in `Computed` and `Effect`.
  - **O(1) Deduplication**: Implemented Global Epoch system for efficient dependency collection without Set lookups.
  - **Smi Optimization**: Applied V8 Small Integer masking to `id` and `version` fields for stable hidden classes.
  - **Latency**: Reduced `Computed` creation time by **34%** and `Effect` creation by **17%**.
  - **GC Pressure**: Improved efficiency by **20%** in high-churn scenarios.

- **Safety & Stability**
  - **Scheduler Phases**: Strictly enforced `IDLE` -> `BATCHING` -> `FLUSHING` lifecycle to prevent infinite loops and re-entrancy bugs.
  - **Error Recovery**: `Computed` and `Effect` now retain valid dependencies even if execution fails, enabling self-recovery.
  - **Cleanups**: Removed `DependencyManager` (refactored into internal logic) to reduce bundle size and complexity.

## [0.1.5] - 2026-01-02

### Build - 0.1.5

- **Artifact Optimization**: Optimized build output to satisfy `mjs, cjs, d.ts` structure.
  - Bundled type definitions into a single `index.d.ts` using `vite-plugin-dts` (`rollupTypes: true`).
  - Configured `vite.config.ts` to output clean artifacts while maintaining sourcemaps (`.map`) for debugging support.
  - Standardized `package.json` paths (`main`, `module`, `types`) to explicitly use `./dist/` prefix.

## [0.1.4] - 2026-01-02

### Changed - 0.1.4

- `ComputedAtomImpl` V8 Hidden Class Monomorphism by enforcing strict property initialization order.

## [0.1.3] - 2026-01-02

### Changed - 0.1.3

- **Performance**
  - Implemented "Delta Sync" (Diffing) in `Effect` and `Computed` to minimize subscription churn.
  - Refactored `DependencyManager` to use Strong References (`Dependency[]`) instead of `WeakRef` for active dependencies.
  - Optimized `Scheduler` using double buffering (`queueA`/`queueB`) and direct `Set` iteration.
  - Reused dependency buffers (`Set`) in `Computed` and `Effect` to reduce per-execution allocations.
- **Stability**
  - Replaced `AtomImpl`'s custom subscription logic with `SubscriberManager` to fix potential index corruption bugs.

### Fixed - 0.1.3

- **Effect**: Resolved an issue where infinite loops caused by synchronous self-modification were not detected due to delayed subscription.

## [0.1.2] - 2026-01-01

### Changed - 0.1.2

- Update README.md

## [0.1.1] - 2026-01-01

### Changed - 0.1.1

- Change Installation command in README.md

## [0.1.0] - 2025-12-31

### Added - 0.1.0

- Initial release
- Core primitives: `atom`, `computed`, `effect`, `batch`, `untracked`
- Zero dependencies implementation
- Full TypeScript support with strict type checking
- Object pooling for performance optimization
- Circular dependency detection
- Infinite loop protection
- Comprehensive test suite (200+ test cases)
- Performance benchmarks
