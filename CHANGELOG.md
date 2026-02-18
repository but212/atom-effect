# Changelog

## [0.21.3]

### jQuery

- **Router**:
  - **Reactive Query Params**: Added `queryParams` atom to `Router` to track URL query parameters reactively.
  - **Optimized Param Updates**: Introduced `onParamsChange` hook to handle same-route parameter changes efficiently without full re-renders.
  - **Mount Hook**: Added `onMount` lifecycle hook for template-based routes, providing direct access to the rendered jQuery element.
  - **Performance**: Consolidated active link tracking into a single effect, significantly reducing memory usage for apps with many navigation links.
  - **Robustness**: Traceable `history.pushState` and `history.replaceState` failures (e.g., `file://` protocol) now log warnings via `debug` instead of crashing, with strict try-catch guards around all History API interactions.

## [0.21.3]

### Core

- **Tree-shaking**: Configured Vite to remove debug code in production builds (~6% bundle size reduction).
- **Symbol.dispose**: Implemented `[Symbol.dispose]()` on `Atom`, `Computed`, and `Effect` for `using` keyword support.

## [0.21.1]

### Core - 0.21.1

- **Effect Resource Leak**: Fixed failed subscription cleanup after mid-execution errors.
- **Naming**: Renamed `SubscriberLink` to `Subscription` to avoid confusion.
- **Computed Fallback**: `defaultValue` now serves as a fallback for all error types, including non-recoverable ones.
- **Hardcoded Values**: extracted constants and error messages to dedicated files.

### jQuery - 0.21.1

- **Hardcoded Values**: extracted constants, log prefixes, and error messages to `constants.ts`.

## [0.21.0]

### Core - 0.21.0

- **Brand Symbols**: Added specific symbols for robust runtime type identification.
- **Version Hashing**: Implemented bitwise hashing for version snapshots.
- **Modernization**: Adopted ES2021 syntax and updated build targets.

### jQuery - 0.21.0

- **$.atomFetch**: Added declarative reactive AJAX primitive.
- **Native DOM Routing**: Migrated routing to native APIs.
- **Type Safety**: Improved reactivity checks using new core symbols.

## [0.20.0]

### Core - 0.20.0

- **Optimization & Refactoring**:
  - **Epoch Unification**: Merged epoch counters to simplify tracking.
  - **Flag Inlining**: Inlined constants to reduce lookup overhead.
  - **Computed Simplification**: Streamlined error collection and removed complex lookup tables.
  - **Effect Loop Detection**: Switched to sliding window approach for efficiency.
  - **Subscription Parking**: Optimized subscription reuse with linear scanning.
  - **Code Cleanup**: Removed internal type wrappers, unused object pools, and redundant properties (`timestamp`, `_modifiedAtEpoch`).
  - **Method Inlining**: Inlined hot-path methods (`_commitDeps`, `_checkLoopWarnings`) for performance.

### jQuery - 0.20.0

- **Refactoring**:
  - **Delegation**: Refactored chainable methods to use unified binding handlers.
  - **Normalization**: Standardized `atomChecked` and `bindVisibility` logic.
  - **Performance**: Centralized equality checks and optimized debug mode DOM access.
  - **Router**: Switched to `URLSearchParams` and added `pushState` support.
  - **CSS**: Unified array/string value handling in `bindCss`.

## [0.19.1]

### Core - 0.19.1

- **Dependency Ownership**: Replaced global node pollution with local subscription maps for cleaner tracking.

### jQuery - 0.19.1

- **Security Hardening**: Implemented comprehensive XSS protection in bindings (blocking `on*` events and dangerous CSS).
- **Sanitization**: Refactored `sanitizeHtml` for performance and safety.

## [0.19.0]

### Core - 0.19.0

- **Features**:
  - **Async Retries**: Added `maxAsyncRetries` to `ComputedOptions`.
  - **Pool Stats**: Added stats enablement for `ArrayPool`.
  - **Error Tracking**: Optimized `hasError` checks with O(1) lookups.
- **Performance & Refactoring**:
  - Optimized subscriber notification loop.
  - Extracted version arithmetic and flag masks for maintenance.
  - Improved type safety for empty links.

### jQuery - 0.19.0

- **Type Safety**: Refactored `RouteDefinition`, `atomVal`, and `bindVal`.
- **Safety & Stability**:
  - **XSS Prevention**: Minimal sanitization for `atomHtml`.
  - **Route Safety**: Safe URI parsing for malformed URLs.
  - **Diagnostics**: Added duplicate key warnings in production.

## [0.18.0]

### Core - 0.18.0

#### Changed - Core 0.18.0

- **Memory Efficiency**: Replaced `Set` with strict array deduplication for error collection in `ComputedAtom`, and reduced closure allocations in `Effect._isDirty` checks.
- **Refactor**: Removed redundant `_fnSubCount` and `_objSubCount` counters from `ReactiveDependency`, simplifying subscriber tracking to use direct array length checks.

### jQuery - 0.18.0

#### Added - jQuery 0.18.0

- **Router**: Introduced `$.route()` for lightweight, hash-based SPA routing with full reactivity support.
  - **Reactive State**: Exposes `currentRoute` as an atom, allowing UI to react instantly to navigation changes.
  - **Lifecycle Management**: Supports `onEnter` and `onLeave` hooks for data fetching and navigation guards.
  - **Automatic Binding**: Declaratively binds links with `data-route` to handle navigation and `active` class toggling automatically.
  - **Template Rendering**: Supports both `<template>` refs and custom render functions for flexible view management.

## [0.17.0]

### Documentation - 0.17.0

- **Restructure**: Major documentation overhaul for improved discoverability and depth.
  - **Core**: Extracted detailed guides into `docs/API.md`, `docs/ARCHITECTURE.md`, and `docs/ONBOARDING.md`. Refined `README.md` for quick start.
  - **jQuery**: Added `docs/API.md` and `docs/PATTERNS.md` for comprehensive API reference and common recipes. Refined `README.md`.
  - **Cleanup**: Removed root `ARCHITECTURE.md` in favor of package-specific documentation.

### Core - 0.17.0

#### Added - Core 0.17.0

- **Test Coverage**: Expanded unit tests for edge cases including disposal errors, lazy evaluation, and infinite loop detection.

#### Changed - Core 0.17.0

- **Performance**: Optimized core classes with inline property initialization, bitwise masks, and loop streamlining for improved V8 stability.
- **Architecture**: Converted internal utilities to singletons and decomposed complex methods to reduce bundle size and cyclomatic complexity.
- **DX & Maintenance**: Standardized error types, implemented `Symbol`-based debugging, and refined public API documentation.
- **Code Cleanup**: Streamlined internal constants and utility logic (pools, errors) for better maintainability and smaller footprint.

## [0.16.1] - 2026-01-27

### Core - 0.16.1

#### Changed - Core 0.16.1

- **AOS Refactoring**: Replaced parallel arrays with `Link` objects (`DependencyLink`, `SubscriberLink`) to improve data cohesion and cache locality.

## [0.16.0] - 2026-01-27

### Core - 0.16.0

#### Changed - Core 0.16.0

- **Reactive Engine Optimization**: Achieved massive performance gains through V8 hidden class stabilization (monomorphism), property access reduction, and bitwise flag consolidation.
- **Hot Path Performance**: Micro-optimized tracking and notification loops to minimize call stack depth and branch mispredictions.
- **Memory Efficiency**: Implemented zero-allocation array reuse (`arr.length = 0`) across `Atom`, `Computed`, and `Effect` to reduce GC pressure.
- **Scheduler Advancement**: Refactored buffer management and drain cycles for better cache locality and microtask efficiency.
- **Logical Simplification**: Hoisted error handlers and internal helpers (e.g., `_addSubscriber`) to improve JIT inlining and code reuse.

### jQuery - 0.16.0

#### Changed - jQuery 0.16.0

- **DOM Rendering Performance**: Implemented redundant write guards (`el.textContent !== newVal`) and direct property access to minimize expensive layout reflows.
- **Memory & Lifecycle**: Migrated from jQuery's `$.data()` to `WeakMap`-based binding records and debug states, ensuring zero memory leaks and faster lookup.
- **Binding Engine Consolidation**: Unified declarative and chainable binding handlers into a shared context, reducing closure nesting.
- **CSS Optimization**: Introduced a camel-case property cache to eliminate repeated regex overhead during style updates.
- **List Reconciliation**: Optimized shallow equality and path preparation in `atomList` for hardware-friendly propagation.
- **Debug Refinement**: Refactored visual highlighting using `requestAnimationFrame` and direct style manipulation for minimal overhead in development.

## [0.15.4]

### Core - 0.15.4

#### Fixed - Core 0.15.4

- **Lazy Computed Sensitivity**: Fixed a bug where `Effect` would incorrectly skip execution if a dependency was a stale `computed` atom. The execution check now forces a re-evaluation of computed dependencies and re-checks their version to guarantee UI consistency in complex dependency graphs.

## [0.15.3]

### Core - 0.15.3

#### Added - Core 0.15.3

- **Edge Cases**: Added test for circular dependencies in effects.

### jQuery - 0.15.3

#### Fixed - jQuery 0.15.3

- **atomList Edge Cases**:
  - **DOM Cleanup Race Condition**: Fixed a race condition where async `onRemove` callbacks could leave "ghost" elements in the DOM if re-added synchronously. Added `isConnected` checks during reconciliation to correctly handle detached nodes.
  - **Focus Loss on Update**: Implemented shallow equality check for item updates. Prevents unnecessary DOM replacement when the object reference changes but content is identical, preserving input focus during reordering or immutable updates.
  - **Duplicate Key Robustness**: Added warnings for duplicate keys in debug mode and improved reconciliation logic to recover gracefully from key collisions.
  - **Empty Template Typing**: Fixed TS error in empty template logic.

## [0.15.2]

### jQuery - 0.15.2

#### Changed - jQuery 0.15.2

- **atomList**: Enhanced `render` and `empty` options to support `DocumentFragment` and `JQuery` objects, providing more flexibility in template rendering.

## [0.15.1]

### jQuery - 0.15.1

#### Fixed - jQuery 0.15.1

- **Debounce Blur Data Loss**: Fixed a critical bug where user input was lost when blurring an input field with a pending debounce timer. The `onBlur` handler now flushes pending sync operations before formatting.
- **Zombie Binding Cleanup**: Fixed orphaned `_aes-bound` class markers on cloned elements. `cleanupDescendants` now removes the marker class from elements that have no WeakMap binding data.
- **Cursor Jumping on External Update**: Improved UX by preserving cursor position when an input's atom value is updated externally while focused.
- **State Phase Recovery**: Wrapped state phase transitions in `try...finally` blocks to ensure `state.phase` is always reset to `'idle'` even if `parse()` or DOM operations (e.g., `setSelectionRange`) throw errors.

## [0.15.0]

### Core - 0.15.0

#### Fixed - Core 0.15.0

- **Circular Dependencies**: Throws `ComputedError` instead of returning undefined.
- **Effect Errors**: Correctly throws `EFFECT_DISPOSED` and fixed rate limit execution flow.
- **Atom Notifications**: Fixed a race condition where notifications were flushed after disposal, preventing `undefined` values from reaching subscribers.
- **Async Effect Cleanup**: Fixed a memory leak where stale async cleanup functions could clobber newer ones; implemented execution ID tracking to ensure only the latest cleanup is kept and stale ones are disposed of.

#### Changed - Core 0.15.0

- **DEV Guards**: Added warnings for duplicate subscriptions and mismatched batching; optimized production checks.
- **Internal Logic**: Improved object pool resetting, epoch overflow prevention, and type guard simplification.
- **Drift Detection**: Enhanced async drift detection in computed atoms by using DJB2-style bitwise hash mixing for snapshots and increasing sensitivity to detect any change.

#### Removed - Core 0.15.0

- Cleaned up unused private methods, redundant state resets, and duplicate JSDoc.
- **Priority System**: Simplified the `Scheduler` by removing the unused urgent queue system and priority calculation logic.
- **Unused Methods**: Removed `isUrgent()` and `_getAggregateShift()` from `ComputedAtomImpl` (not part of the public API).
- **Constants**: Removed obsolete phase-shift constants (`PHASE_BITS`, `PHASE_THRESHOLD`, `PHASE_MASK`) as the priority system has been decommissioned.

### jQuery - 0.15.0

#### Fixed - jQuery 0.15.0

- Improved cleanup error logging and registry management for detached nodes.

#### Changed - jQuery 0.15.0

- **Bindings**: Added custom equality support and unified phase state logic.
- **Types**: Enhanced event handler and binding map type safety, replacing `any` with strong types.
- **Consistency**: Ensured static values trigger DOM debug events.
- **atomList**: Added duplicate key warnings in development mode (when `debug.enabled` is true) to improve robustness and debuggability.

#### Removed - jQuery 0.15.0

- Removed unused `effects` context field and redundant variables.

## [0.14.0]

### Core - 0.14.0

#### Performance - Core 0.14.0

- **Subscriber Management**: Refined internal storage and notification paths using bitwise flags and pre-initialized arrays.
- **State Logic**: Improved state transition logic and dependency checks for more consistent performance.

#### Refactor - Core 0.14.0

- **Internal Cleanup**: Simplified property access and synchronized state flags to improve code clarity and maintainability.

### jQuery - 0.14.0

#### Refactor - jQuery 0.14.0

- **Automatic Batching**: Wrapped jQuery event handlers in `batch()` to ensure synchronous DOM updates and state consistency within handlers.

## [0.13.1]

### jQuery - 0.13.1

#### Fixed - jQuery 0.13.1

- **Marker Class**: Changed `aes-bound` to `_aes-bound` to avoid potential conflicts with other libraries.

## [0.13.0]

### Benchmarks - 0.13.0

- **Benchmark Suite Overhaul**: Refactored the benchmark suite to prioritize statistical significance and eliminate measurement noise.
  - **Batch Operations**: Migrated micro-benchmarks (creation, read, write) to batch operations (x1000) to ensure the signal-to-noise ratio is high enough to overcome JIT and measurement overhead.
  - **Setup Cost Isolation**: Refactored realistic scenarios (e.g., input latency) to move reactive graph initialization outside the measurement loop, focusing purely on propagation performance.
  - **Vanilla Baselines**: Introduced Vanilla JS counterparts in macro-benchmarks (Data Grid) to provide a transparent comparison of library overhead versus direct implementation.
  - **Consolidation**: Merged redundant micro-benchmarks (e.g., `untracked.bench.ts`) into core suites to reduce suite fragmentation.
  - **Statistical Rigidity**: Increased iterations and warmup periods in `utils/setup.ts` to ensure consistent results (< 5% CV).

### Refactor - 0.13.0

- **Core Architecture Refactoring**: Flattened source structure and consolidated types for better maintainability.
  - Flattened `core/` directory: Moved `atom.ts`, `computed.ts`, `effect.ts`, and `dep-tracking.ts` directly into `src/core/`.
  - Consolidated Type System: Merged all interfaces from `src/types/*.ts` into a single, comprehensive `src/types.ts` file.
  - Internal Reorganization:
    - Moved `scheduler.ts` and `batch.ts` to `src/internal/`.
    - Unified `ReactiveNode` and `ReactiveDependency` into `src/core/base.ts`.
  - Path Alias Adoption: Migrated all internal and test imports to use `@/` path aliases, decoupling implementation from file-system structure.
- **Test Suite Optimization**: Refactored core unit tests to eliminate redundancy and improve signal quality.
  - Consolidated error handling: Unified sync and async mode error tests in `atom.test.ts` and `effect.test.ts` to ensure consistency.
  - Reduced Overlap: Pruned redundant "happy path" tests across `atom`, `computed`, and `effect` unit tests.
  - Smoke Test Streamlining: Refactored `reactive_core.test.ts` into a focused high-level integration suite, moving implementation-specific checks to unit tests.
  - Structural Cleanup: Fixed structural nesting and indentation issues in `effect.test.ts` and `computed.test.ts` for better maintainability.
- **Reliability and Type Safety**: Resolved path errors in `reactive_core.test.ts` and ensured a clean, signal-rich test suite.

### jQuery - 0.13.0

#### Fixed - jQuery 0.13.0

- **Double Cleanup**: Prevented duplicate cleanup execution on node removal.
  - `$.fn.remove` now marks elements as "ignored" before removal, preventing `MutationObserver` from triggering a second cleanup pass.

#### Refactor - jQuery 0.13.0

- **Marker-based Tree Traversal**: Optimized `cleanupTree` (used in `.empty()`, `.remove()`) to be O(M) where M is the number of bound elements, instead of O(N) (all descendants).
  - Introduced `AES_BOUND` class marker to instantly locate bound descendants using `querySelectorAll` (`.aes-bound`).
  - Significantly reduces main-thread blocking when clearing large lists or tables.
- **Algorithm Isolation**: Moved `getLIS` (Longest Increasing Subsequence) to `utils.ts` to separate algorithmic complexity from DOM manipulation logic.
- **Test Suite Refactoring**: Streamlined the jQuery test suite to prioritize signal over noise and reduce maintenance cost.
  - **Redundancy Pruning**: Merged 13 test files into 8 focused suites, eliminating contiguous overlap between unit, integration, and declarative tests.
  - **Consolidation**:
    - Merged `mount.test.ts` and `memory.test.ts` into `lifecycle.test.ts` (Lifecycle & Cleanup).
    - Merged `keyed-diffing.test.ts` into `list.test.ts` (Efficient List Reconciliation).
    - Moved global namespace checks from `namespace.test.ts` to `integration.test.ts`.
  - **Specialization**:
    - `input.test.ts` now serves as the single source of truth for all two-way bindings (`val`, `checked`), IME, and focus tracking.
    - `chainable.test.ts` was slimmed down to focus purely on API surface and method chaining.

## [0.12.0]

### Refactor - 0.12.0

- **Internalization and Simplification**:
  - Internalized subscriber management within `ReactiveDependency` by removing the `SubscriberManager` class.
  - Simplified `Atom`, `Computed`, and `Effect` to manage subscriber arrays (`_fnSubs`, `_objSubs`) directly, reducing indirection and allocations.

- **Type Extraction**: Extracted `EffectExecutionContext` interface to `types/effect.ts` for consistency with `ComputationContext`.
  - Centralized context type alongside other effect types.
  - Updated `EffectImpl` to import the type instead of defining inline.
  - Renamed `_prepareEffectContext()` → `_prepareEffectExecutionContext()`.

- **Code Deduplication**: Unified sync/async result handlers in `ComputedAtomImpl`.
  - Extracted shared logic into `_finalizeResolution(value: T)` method.
  - `_handleSyncResult()` and `_handleAsyncResolution()` now delegate to unified method.
  - Reduces code duplication and improves maintainability.

### jQuery - 0.12.0

#### Refactor & Type Safety

- **Unified Reactive Logic**: Introduced `effect-factory.ts` to centralize reactive binding logic, eliminating ~40% of boilerplate in the binding layer.
- **Decomposed List Reconciliation**: Refactored `atomList` using a structured lifecycle pattern (Empty State, Removal, LIS-Reconciliation, Patching).
- **Improved Type Safety**: Extracted `BindingContext` and removed all `any` types and non-null assertions across reconciliation and binding hot paths.

#### Performance & Hardware-Friendly Optimization

- **Native DOM API Adoption**: Migrated high-frequency binding handlers (`text`, `html`, `class`, `css`, `attr`) to native properties (e.g., `textContent`, `classList`), bypassing jQuery wrapper overhead.
- **Hybrid CSS Binding**: Optimized `bindCss` using direct `style` property access to support both camelCase and kebab-case while maintaining native speed.
- **Allocation Optimization**: Replaced `Object.entries()` with `for...in` loops across all handlers to eliminate temporary array allocations during reactive updates.
- **Zero-Overhead Events**: Switched to native `addEventListener` for general events while ensuring full compatibility with jQuery's `.trigger()` for form controls.
- **Resource Efficiency**: Implemented lazy element wrapping to minimize jQuery object creation cost.

## [0.11.0]

### Core - 0.11.0

#### Added - Discrete Phase-Shift Versioning

- **Architecture**: Implemented a new **Discrete Phase-Shift** versioning system for high-performance reactive tracking.
  - Replaced linear integer incrementing with a 30-bit cyclic phase structure (10-bit Cycle, 20-bit Phase) optimized for V8 Smi.
  - Moved `version` field from `ReactiveDependency` to `ReactiveNode` to unify identity and status tracking across all node types (Atoms, Computed, Effects).
- **Performance**: Introduced **Branchless Operations** for version management and priority calculation.
  - `rotatePhase()`: O(1) bitwise rotation handling overflow and cycle increments without branches.
  - `getShift()`: O(1) branchless modular distance calculation between versions.
- **Glitch Reduction**: Enhanced `Scheduler` with an **Urgent Priority Queue**.
  - Jobs with a phase shift exceeding `PHASE_THRESHOLD` (90° equivalent) are prioritized to resolve stale states first.
  - Implemented branchless urgency detection: `((PHASE_THRESHOLD - 1 - shift) >>> 31) & 1`.
- **Computed Optimization**: Added `_getAggregateShift()` to track total staleness across all dependencies, allowing computed nodes to inform the scheduler of their combined priority.
- **Async Drift Validation**: Implemented phase drift detection for async computed values.
  - Captures dependency version snapshot at async start (`_captureVersionSnapshot()`).
  - Validates drift on resolution: if `drift >= PHASE_THRESHOLD`, the result is stale.
  - **Fail-Fast Policy**: Stale results trigger recomputation (up to `MAX_ASYNC_RETRIES = 3`). On exhaustion, throws `ComputedError` for graceful degradation via `hasError`/`defaultValue`.
  - Prevents UI flickering from race conditions while maintaining branchless performance.

## [0.10.1]

### Core - 0.10.1

#### Changed - Core 0.10.1

- Added `ATOM_STATE_FLAGS` and simplified internal logic for `AtomImpl`.
  - Implemented lazy initialization for subscriber managers to reduce initial memory footprint.
  - Streamlined `value` getter/setter using Guard Clauses for improved readability.
  - Reused notification task closures to avoid unnecessary heap allocations during updates.

### jQuery - 0.10.1

#### Changed - jQuery 0.10.1

- Refactored internal logic for `atomList`, `registry`, and chainable methods.
  - Updated `getLIS` and reconciliation loop in `atomList` for better memory usage and stability.
  - Optimized `registry` for element tracking and recursive tree cleanup.
  - Refined `chainable` bindings by moving invariant checks out of element iteration loops.

## [0.10.0]

### Core - 0.10.0

#### Changed - Core 0.10.0

- **Docs**: Clarified `batch(fn)` behavior.
  - Emphasized that `batch()` results in **Synchronous Reflection** (immediate flush) upon completion.
  - Noted that the engine already performs **Automatic Microtask Batching** by default.
  - Updated JSDoc and README to reflect these definitions.

### jQuery - 0.10.0

#### Changed - jQuery 0.10.0

- **Refactor**: Removed redundant `batch()` calls from event handlers and internal synchronization.
  - Relying on Core's automatic microtask batching for better performance and alignment with the browser's event loop.
  - Affects `$.fn.atomOn`, `$.fn.atomChecked`, `$.fn.atomVal`, and the global `$.fn.on` override.
- **Docs**: Updated README to reflect that `atomOn` focuses on automatic lifecycle management (cleanup) rather than manual batching.

## [0.9.2]

### Core - 0.9.2

#### Changed - 0.9.2

- **Docs**: Removed performance note from README.md.

## [0.9.1]

### Core - 0.9.1

#### Changed - 0.9.1

- **Performance**: Overhauled `Scheduler` for true "Automatic Group Updates".
  - Replaced microtask-chaining with a robust `_drainQueue` mechanism.
  - Synchronous updates within the same tick are now gathered into a single microtask execution cycle.
  - Eliminates redundant microtask scheduling and context switching, significantly reducing CPU overhead in high-churn scenarios.
  - Ensures a more accurate representation of engine throughput in benchmarks.

## [0.9.0]

### Core - 0.9.0

#### Changed - 0.9.0

- **Performance**: Optimized Effect loop detection in debug mode.
  - Replaced O(N) array shifting with O(1) Circular Buffer for execution history tracking.
  - Reduces overhead for high-frequency effects during development.
- **Safety**: Enhanced Epoch system robustness.
  - Added wrap-around safety check to `nextEpoch` to prevent theoretical collision at 0.

#### Added - 0.9.0

- **Effect API**: Added `onError` option to `EffectOptions`.
  - Allows handling errors (including async rejections) that occur during effect execution.
  - Provides a safe way to log or recover from effect failures.

## [0.8.4]

### Refactor - 0.8.4

- **Benchmarks**: Overhauled the benchmark suite to ensure fairness and accuracy.
  - **Separation of Concerns**: Lifted object creation (atoms, computed, graphs) out of the benchmark loop to measure operation cost purely, distinct from allocation cost.
  - **Valid Mutation**: Replaced static value assignments with toggling/incrementing logic to ensure all updates trigger actual propagation and prevent compiler/runtime no-op optimizations.
  - **New Scenarios**: Added specific benchmarks for `batch()` throughput in `frame-budget` and pure Effect re-execution in `effect.bench`.

## [0.8.3]

### Refactor - 0.8.3

- Introduced `ComputationContext` interface to types for better type safety in computed atom lifecycle.
- Reduced duplication in `AtomImpl` and `ComputedAtomImpl` by utilizing shared tracking utility.

## [0.8.2]

### Fixed - 0.8.2

- **Publishing**: Added `publishConfig.access: public` to `@but212/atom-effect-jquery` to fix NPM payment required error for scoped packages.
- **Versioning**: Bumped all packages to 0.8.2.

## [0.8.1]

### Fixed - 0.8.1

- **Publishing**: Scoped `atom-effect-jquery` to `@but212/atom-effect-jquery` to resolve NPM publishing permission errors.
- **Versioning**: Bumped all packages to 0.8.1 to maintain unified versioning.

## [0.8.0]

### Changed - 0.8.0

- **Monorepo Migration**: Migrated from single-repo to pnpm workspace + Turborepo monorepo structure.
  - Root workspace now manages `packages/core` (@but212/atom-effect) and `packages/jquery` (atom-effect-jquery).
  - Shared tooling: `tsconfig.base.json`, `biome.json` at root level.
  - Turborepo enables parallel builds with dependency-aware caching.
  - `atom-effect-jquery` now uses `workspace:*` dependency for seamless local development.
- **Unified Versioning**: Both `@but212/atom-effect` and `atom-effect-jquery` now share the same version number.
  - Single `v*` tag deploys both packages to NPM simultaneously.
  - Ensures compatibility between core and bindings.

### Refactor - 0.8.0

- **Code Deduplication**: Extracted shared two-way data binding logic into `applyInputBinding` helper.
  - Unified `$.fn.atomVal` (chainable) and `bindVal` (declarative) implementation.
  - Consolidated input handling logic (debounce, IME, focus tracking) in centrally managed module.

### Infrastructure - 0.8.0

- Added `pnpm-workspace.yaml` for workspace definition.
- Added `turbo.json` for build pipeline (build → test → lint).
- Added `tsconfig.base.json` for shared TypeScript configuration.
- Updated `publish.yml` to deploy both packages with unified version validation.
- Updated GitHub workflows (`ci.yml`, `benchmark.yml`) for monorepo paths.
- Added `.turbo` to `.gitignore`.

## [0.7.0]

### Added - 0.7.0

- **Error Propagation**: Implemented automatic error propagation and accumulation through computed value chains.
  - Added `errors: readonly Error[]` to `ComputedAtom`: Returns an immutable array of deduplicated errors from self and all dependencies.
  - Added `isValid: boolean` to `ComputedAtom`: Convenience getter (inverse of `hasError`).
  - Extended `hasError` to propagate error status from the dependency chain.

### Changed - 0.7.0

- **Graceful Error Handling**: `ComputedAtom` now catches errors thrown by dependencies and wraps them in `ComputedError`.
  - If a computed value has a `defaultValue` and encounters a recoverable error (default for `ComputedError`), it will return the `defaultValue` on subsequent accesses instead of re-throwing. This allows downstream dependencies to continue execution (graceful degradation).
- **Error Deduplication**: The `errors` array uses a `Set` internally to ensure the same `Error` instance only appears once, preventing duplicate error reports in diamond dependency patterns.

### Fixed - 0.7.0

- **Dependency Tracking**: Fixed an issue where computed values throwing synchronous errors would not register themselves as dependencies in parent computations. Tracking is now registered before computation execution.
- **Async Error Propagation**: Fixed an issue where async computed values did not correctly propagate error states to downstream dependencies.
  - Ensures `hasError` is correctly set on downstream computed values even when the upstream throws (blocked state).
  - Enables true declarative error handling in async chains (no need for manual error checks).

### Example - 0.7.0

- **Async Propagation**: Added `examples/async-propagation.html` - A comprehensive demo of declarative async pipeline handling.
  - Showcases "Callback Hell vs Atom-Effect Declarative" comparison.
  - Demonstrates how to build robust async pipelines (User -> Repos -> Stats) without manual error plumbing.
  - Visualizes automatic error propagation and "blocked" states.

### Refactor - 0.7.0

- **Internal Cleanup**: Removed redundant `ComputedStateFlags` and separate handler classes (`SyncComputationHandler`, `AsyncComputationHandler`) as their logic is now efficiently inlined within `ComputedAtom`.

## [0.6.0]

### Fixed - 0.6.0

- **Async Computed**: Fixed subscriber notification on async resolution.
  - `_handleAsyncResolution` now calls `_notifyJob()` after async computation completes, ensuring effects are re-executed when async computed values resolve.

### Changed - 0.6.0

- **Async Computed State Tracking**: All state getters now trigger dependency tracking.
  - `.state`, `.hasError`, `.lastError`, `.isPending`, `.isResolved` getters now call `_registerTracking()`.
  - Effects and computed values that only read state properties (e.g., `searchResults.state`) will now properly re-execute when the async state changes.
  - This provides a more intuitive developer experience — no need to read `.value` first just to track state changes.
- **CDN**: Updated CDN options to use `unpkg` and `jsdelivr` instead of `jsDelivr`.

### Added - 0.6.0

- **Example**: Added `examples/async-computed-dom.html` - A standalone demo showcasing async computed as a first-class citizen with vanilla DOM manipulation.
  - Demonstrates GitHub user search with real-time status tracking.
  - Shows `state`, `isPending`, `isResolved`, `hasError` reactive properties in action.

## [0.5.1]

### Changed - 0.5.1

- **Scheduler Tuning**: Relaxed Scheduler limits to support higher-frequency updates and complex dependency graphs.
  - Increased `MAX_EXECUTIONS_PER_EFFECT` from 50 to **100**.
  - Increased `MAX_EXECUTIONS_PER_SECOND` (Legacy/Fallback) from 100 to **1000**.
  - Increased `MAX_EXECUTIONS_PER_FLUSH` from 5000 to **10000**.
  - Increased `CLEANUP_THRESHOLD` from 100 to **1000**.
  - This change reduces false positives in infinite loop detection during high-load scenarios.

## [0.5.0]

### Refactor - 0.5.0

- **Code Organization**: Centralized utility functions and improved module structure.
  - Moved generic utility functions to `src/utils/` (`ArrayPool`, `type-guards`, `error`).
  - Consolidated tracking type guards into `src/utils/type-guards.ts`.
  - Moved `wrapError` to `src/utils/error.ts`.
- **Type Safety**: Introduced Branded Types for strict ID typing.
  - Implemented `DependencyId` branded type to prevent accidental number assignment.
  - Updated `ReactiveNode` and `Dependency` interfaces to use `DependencyId`.

### Changed - 0.5.0

- **Breaking Change**: `batch` and `untracked` now propagate original errors instead of wrapping them in `AtomError`.
  - Removed `try-catch` overhead from these functions.
  - Consumers expecting `AtomError` wrappers should update their error handling logic to catch specific error types directly.

## [0.4.0]

### Changed - 0.4.0

- **Refactor and Simplify**: Streamlined `Atom`, `Computed`, and `Effect` implementations
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

### Fixed - 0.3.3

- Fixed computed caching bug where `_setIdle()` in `_markDirty()` cleared the RESOLVED flag, causing computed values to re-execute on every access instead of returning cached values.

### Changed - 0.3.3

- **Architecture**: Moved internal modules (`pool.ts`, `epoch.ts`, `scheduler/`) to `src/internal/` for better encapsulation.
- **Documentation**: Reduced excessive JSDoc comments across 7 core files (~1,200 lines removed):
  - `debug.ts`, `object-pool.ts`, `subscriber-manager.ts`, `atom.ts`, `effect.ts`, `computed/index.ts`, `context.ts`
  - Retained essential API documentation while removing redundant `@fileoverview`, `@remarks`, and `@example` blocks.

### Added - 0.3.3

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
