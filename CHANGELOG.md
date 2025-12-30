# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-10-12

### Added

- **Scheduler API**: Added `scheduler.setMaxFlushIterations()` for configuring max batch iterations
- **Type Safety**: Added function overloads for `computed()` to enforce `defaultValue` for async functions
- **Export**: Exported `scheduler` instance for advanced configuration

### Fixed

- **Critical**: Effect now properly disposes in production when infinite loop is detected (prevents system hang)
- **Critical**: Added Promise ID overflow protection in async computed (prevents race conditions in long-running apps)
- **Memory**: Changed `originalDescriptors` from Map to WeakMap in effect for better garbage collection

### Changed

- **Error Messages**: Improved scheduler error messages with actionable suggestions
- **Code Quality**: Removed unused internal variables and functions

### Security

- Enhanced memory safety with WeakMap usage in effect tracking

## [1.0.0] - 2025-10-08

### Added

#### Core Features

- **Atom**: Reactive state primitive with automatic dependency tracking
- **Computed**: Derived state with synchronous and asynchronous support
- **Effect**: Side effect management with automatic cleanup
- **Batch**: Batch update system for performance optimization

#### Performance Optimizations

- Object pooling for reduced GC pressure
- Lazy initialization for memory efficiency
- WeakRef-based dependency management to prevent memory leaks
- Hot/Cold path optimization for error handling
- queueMicrotask-based scheduler for optimal performance
- O(1) subscription management with Map-based lookup
- Sliding window algorithm for infinite loop detection

#### Developer Experience

- Full TypeScript support with strict type checking
- Circular dependency detection in development mode
- Automatic debug ID assignment (`atom_1`, `computed_2`, etc.)
- Infinite loop detection with configurable thresholds
- Structured error class hierarchy
- Comprehensive JSDoc documentation

#### Testing & Benchmarking

- 11 test files with 400+ test cases
- Micro benchmarks (atom, computed, effect, batch operations)
- Macro benchmarks (diamond problem, todo app, dashboard, large graph)
- Memory benchmarks (leak detection, GC pressure)
- Integration tests

#### Configuration

- `DEBUG_CONFIG`: Development mode settings
- `POOL_CONFIG`: Object pooling configuration
- `SCHEDULER_CONFIG`: Batch processing settings
- Bit flags for efficient state management

#### Utilities

- `batch()`: Batch multiple updates
- `untracked()`: Prevent dependency tracking
- `isAtom()`, `isComputed()`, `isEffect()`: Type guards
- Debug utilities for development

### Documentation

- Comprehensive README with examples
- API reference documentation
- Benchmark documentation
- Quick start guide
- Architecture design documentation

### Package

- Zero external dependencies
- Tree-shakeable with `sideEffects: false`
- Full ESM and CommonJS support
- TypeScript declaration files with source maps
- MIT License

---

## Version History

### [Unreleased]

- No unreleased changes

### [1.0.0] - 2025-10-08

- Initial release

---

[1.0.0]: https://github.com/but212/reactive-atom/releases/tag/v1.0.0
