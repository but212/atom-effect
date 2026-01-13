# Changelog

## [Unreleased]

### Changed

- **Core Optimizations**: Streamlined `Atom`, `Computed`, and `Effect` implementations
  - Removed unused variables, parameters, and redundant type checks across core classes
  - Renamed `_notify()` to `_scheduleNotification()` and simplified `Atom` getter logic
  - Optimized `Computed` hot paths and merged `Effect` execution conditions for better performance
  - Simplified `isPromise` nullish check and `hasSubscribers` getter in utility modules
  - Consolidated `hasDependencyMethod` type guard branches for cleaner code

- **Type Safety**: Refactored dependency tracking with User-Defined Type Guards
  - Added explicit interfaces: `DependencySubscriber`, `ExecutableSubscriber`
  - Implemented type guards: `hasDependencyMethod()`, `isPlainListener()`, `hasExecuteMethod()`, `isTrackableFunction()`
  - Replaced unsafe `as` type assertions with runtime-validated type guards in `Atom._track()` and `Computed._registerTracking()`
  - Improved code clarity with priority-based tracking logic and explicit comments

## [0.3.3]

### Fixed

- Fixed computed caching bug where `_setIdle()` in `_markDirty()` cleared the RESOLVED flag, causing computed values to re-execute on every access instead of returning cached values.

### Changed - 0.3.3

- **Architecture**: Moved internal modules (`pool.ts`, `epoch.ts`, `scheduler/`) to `src/internal/` for better encapsulation.
- **Documentation**: Reduced excessive JSDoc comments across 7 core files (~1,200 lines removed):
  - `debug.ts`, `object-pool.ts`, `subscriber-manager.ts`, `atom.ts`, `effect.ts`, `computed/index.ts`, `context.ts`
  - Retained essential API documentation while removing redundant `@fileoverview`, `@remarks`, and `@example` blocks.

### Added

- **Memory Tests**: Added comprehensive memory and stability tests in `__tests__/unit/memory/`:
  - `gc-verification.test.ts`: WeakRef-based GC verification tests
  - `circular-reference.test.ts`: Circular dependency detection tests
  - `fuzz.test.ts`: Heavy fuzz testing (1000 atoms, 500 computed, 10000 updates)

## [0.3.2] - 2026-01-09

### Changed - 0.3.2

- **Architecture**: Implemented "Push-State, Pull-Value" reactive propagation pattern.
  - `Computed._markDirty()` now propagates dirty flags synchronously without scheduler registration.
  - Removed `_recomputeJob` field from `Computed` (lazy recomputation via `value` getter).
  - Call stack DFS provides implicit topological ordering, eliminating glitches.
  - **Version-based optimization**: `Computed.version` only increments when value actually changes (respects `equal` option). Enables downstream Computed atoms to detect unchanged dependencies.
  - **Note**: Effects are scheduled during dirty propagation and cannot be skipped by equality checks.

## [0.3.1] - 2026-01-09

### Changed - 0.3.1

- Replaced `Map` with `Array` for `_subscriptions` in `Computed` and `Effect`.
- Replaced `Set` with epoch check for `_modifiedDeps` in `Effect`.
- `Computed` now implements `Subscriber` interface, allowing direct object subscription instead of closures.
- Updated `Atom.subscribe` and `Computed.subscribe` to accept `Subscriber` objects.
- `debug.checkCircular` now uses epoch-based traversal instead of `Set`.

## [0.3.0] - 2026-01-09

### Added - 0.3.0

- Added `maxExecutionsPerFlush` option to `EffectOptions`.
  - Allows configuring the maximum number of executions allowed for a specific effect during a single flush cycle.
  - Helps prevent infinite loops in complex dependency graphs.
  - Defaults to `SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH`.

### Changed - 0.3.0

- **Optimization**
  - Applied branchless optimizations to hot paths in `Computed` and `Effect` state management.
    - Replaced `if/else` branches with bitwise masking for `setRecomputing` and `setExecuting` flags to prevent branch misprediction.

## [0.2.2] - 2026-01-08

### Changed - 0.2.2

- Updated README.md

## [0.2.1] - 2026-01-08

### Changed - 0.2.1

- Replaced `WeakMap` with pure array-based lookup in `SubscriberManager`.

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
