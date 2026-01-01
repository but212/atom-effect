# Changelog

## [0.1.3] - 2026-01-02

### Changed

- **Performance**
  - Implemented "Delta Sync" (Diffing) in `Effect` and `Computed` to minimize subscription churn.
  - Refactored `DependencyManager` to use Strong References (`Dependency[]`) instead of `WeakRef` for active dependencies.
  - Optimized `Scheduler` using double buffering (`queueA`/`queueB`) and direct `Set` iteration.
  - Reused dependency buffers (`Set`) in `Computed` and `Effect` to reduce per-execution allocations.
- **Stability**
  - Replaced `AtomImpl`'s custom subscription logic with `SubscriberManager` to fix potential index corruption bugs.

### Fixed

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
