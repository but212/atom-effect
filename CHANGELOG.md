# Changelog

## [Unreleased]

### Core

#### Changed

- **Performance**: Executed an aggressive engine-level optimization pass.
  - **SVO Unrolling**: Manually unrolled hot loops for subscriber notifications and dependency collection (Small Vector path) to eliminate closure overhead.
  - **Monomorphic Singletons**: Refactored `trackingContext` and `debug` into class-based singletons and unified common reactive state into `ReactiveNode` for stable V8 hidden classes.
  - **Hot-path Density**: Transitioned status management to direct bitwise operations and implemented local variable caching to reduce property lookup depth.
  - **Internal**: Optimized scheduler batching, error paths, and `untracked()` fast-paths for minimal overhead.

### jQuery

#### Changed

- **Refactor**: Completed a high-density overhaul of the `@but212/atom-effect-jquery` package.
  - **Architecture**: Compacted core bindings into monomorphic structures, eliminating over 1,000 lines of redundant logic and complex closures.
  - **Logic**: Hardened `atomForm` reconciliation, streamlined registry lifecycle management, and refined static API registrations.
- **Robustness**: Hardened type safety across all bindings and improved error isolation in `$.route` and `atomFetch`.

#### Documentation

- **Sync**: Updated `API.md` and `ARCHITECTURE.md` to reflect refined internal types and optimized reconciliation engines.

## [0.26.0]

### Core

#### Added

- **Reliability**: Implemented **Infinite Loop Detection** in `incrementFlushExecutionCount()`. Throws an error if the flush execution count exceeds `SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH` (10,000) to prevent browser-freezing reactive loops.
- **Reliability**: Introduced `runInFlushScope(fn)` to provide an exception-safe wrapper for flush cycles, ensuring `endFlush()` is always called even if errors occur.
- **Testing**: Added a dedicated micro-benchmark suite for `SlotBuffer` and `DepSlotBuffer` to quantify SVO (Small Vector Optimization) efficiency.

#### Changed

- **Performance**: Implemented **O(1) Free-Index Slot Reuse** for `SlotBuffer`. Replaces O(N) linear gap-scans with a zero-overhead stack-based index reuse strategy.
- **Performance**: Optimized `SlotBuffer` hot-paths by removing redundant processed-item counters and simplifying loop-exit conditions for better V8 JIT inlining.
- **Performance**: Enhanced `DepSlotBuffer` with direct-path occupant relocation in `insertNew()`, bypassing unnecessary inline slot checks during dependency re-tracking.
- **Consistency**: Updated `nextVersion()` to avoid returning `0` (`(v + 1) & SMI_MAX || 1`). This ensures `version: 0` is strictly reserved for "uninitialized" reactive nodes, matching `nextEpoch()` behavior.

#### Fixed

- **Core**: Resolved a subtle `compact()` edge case where trailing null slots could trigger redundant swap operations.

### jQuery

#### Added

- **API**: `$.lensFor(atom)`: Creates a lens factory bound to a specific atom, simplifying deep path extraction without repeatedly passing the atom reference.
- **API**: `$.atomLens(atom, path)`: Creates a two-way reactive "lens" for a specific property path on an object-based atom.
  - **Type Safety**: Implemented `Paths<T>` (depth 8) and `PathValue<T, P>` recursive types for precise compile-time path validation, IDE autocomplete, and strict zero-`unknown` return type inference.
  - **Memory Safety**: Added subscription tracking and a `.dispose()` method to automatically clean up internal parent atom subscriptions.
  - Supports deep nested paths (e.g., `$.atomLens(user, 'settings.notifications.email')`).
  - Implements **Structural Sharing** to minimize re-renders and memory allocations.
  - Automatically compatible with all jQuery bindings like `atomVal` and `atomForm`.
  - Optimized with equality guards to skip redundant parent atom updates.
- **API**: `$.composeLens(lens, path)`: Composes an existing lens with a sub-path to create a deeper, targeted lens.

#### Changed

- **Performance**: Optimized `$.fn.atomForm` for O(1) performance on large forms. Replaced O(N) effect fan-out with a centralized dispatcher and leaf-level atoms to eliminate redundant effect executions.
- **Internal**: Extracted `getPathValue` utility to `core/lens` for unified and efficient path traversal across lenses and form bindings.

## [0.25.0]

### jQuery

#### Added

- **API**: Native `Promise` support and `AsyncReactiveValue` in all content and attribute bindings (`atomText`, `atomHtml`, `atomClass`, `atomCss`, `atomAttr`, `atomProp`, `atomShow`, `atomHide`). Bindings now automatically resolve `Promise` values and reactive atoms yielding `Promise` values.
- **Testing**: Added comprehensive integration tests for async bindings and race condition scenarios.

#### Changed

- **Performance**: Implemented high-performance metadata caching (camelCase names, attribute properties) for `atomClass`, `atomCss`, `atomAttr`, and `atomProp` to minimize string operation overhead inside reactive loops.
- **Performance**: Introduced JS-level value caching for `atomAttr` to bypass expensive `getAttribute` DOM calls, significantly improving update performance for large attribute sets.
- **Race Condition**: Implemented `latestPromise` and `latestPromiseId` tracking in `effect-factory.ts` to ensure only the result of the most recently assigned `Promise` is applied to the DOM.

## [0.24.1]

### Core

#### Changed

- **Performance**: Optimized `DepSlotBuffer`, `SlotBuffer`, and `ReactiveNode` hot-paths with `switch`-based dispatch and direct property access to leverage V8 jump tables and improve branch prediction.
- **Performance**: Removed redundant DJB2-based `captureVersionSnapshot()` hashing. Async drift detection now leverages the more accurate, unified `_isDirty()` mechanism, eliminating extra hashing overhead and improving consistency with the reactive engine's state tracking.
- **Performance**: Standardized all core reactive classes (`Atom`, `Computed`, `Effect`, `ReactiveNode`) to use explicit constructor-based field initialization for V8 hidden class stability (Monomorphism).
- **Performance**: Optimized `ComputedAtom` and `Effect` dirty-checking with fast-path guards (`hasComputeds`) to skip O(N) dependency scans when only Atoms are involved.
- **Performance**: Bypassed redundant `getAt`/`setAt` dispatch in the hottest core loops (dependency collection and update notification) for significant overhead reduction.
- **Performance**: Refactored `Scheduler` batch merging to eliminate temporary array allocations (`slice`) and closure overhead, significantly reducing GC pressure during high-frequency updates.
- **Performance**: Removed redundant null-checks in `DepSlotBuffer` by leveraging the dense invariant (no holes) of the dependency container.

### jQuery

#### Added

- **API**: `$.fn.atomForm`: Fully automated two-way form binding using `name` attributes. Supports nested property paths (e.g., `name="profile.firstName"`) via optimized "lens" atoms and dynamic DOM changes via `MutationObserver`.

## [0.24.0]

### Core

#### Changed

- **Performance**: Implemented **O(1) Bit-Packed Versioned Slot Buffers** using 32-bit additive hashing and loop unrolling for zero-overhead Atom-heavy graphs.
- **Performance**: Implemented **Deps-Stable Skip** for `Computed` atoms; re-evaluations are bypassed via O(1) version hashing (resolves the Diamond Dependency Problem).
- **Performance**: Added **Hot-path Dependency Caching** in `Computed` atoms, enabling O(1) dirty-state detection for high-frequency updates (scroll/animation).
- **Refactor**: Simplified `Computed` implementation by consolidating dependency tracking logic into the unified `ReactiveNode` hierarchy.
- **Optimization**: Optimized `DepSlotBuffer` for V8 Hidden Classes and eliminated closure allocations in dependency tracking paths.
- **Types**: Replaced `any` with strict generics in `ReactiveNode` for type-safe subscription and notification paths.
- **Feature**: Added `FORCE_COMPUTE` flag to allow manual `invalidate()` calls to bypass stable-skip optimizations.
- **Infrastructure**: Replaced `vite-tsconfig-paths` with native Vite `resolve.tsconfigPaths` support.

#### Removed

- **Internal**: Legacy `ArrayPool` and manual pooling mechanisms.
- **Dependencies**: `vite-tsconfig-paths`.

### jQuery

#### Added

- **API**: `isEqual` option in `atomList` for granular re-render control.
- **API**: `onUnmount` hook injected into `render` and `onMount` (Router) for automated per-route lifecycle cleanup.
- **Optimization**: Introduced `ObjectPool` and `ArrayPool` to recycle `BindingRecord` objects, significantly lowering GC pressure.

#### Changed

- **List Rendering (`atomList`)**: Overhauled the reconciliation engine with a high-performance **1D Flat Buffer** strategy.
  - **O(1) Fast-path**: Implemented Prefix/Suffix trimming to skip unchanged items at the head and tail.
  - **Flat Buffer Diffing**: Transitioned reconciliation state to typed arrays (`Uint8Array`, `Int32Array`) to eliminate "GC hum" in large list updates.
  - **Bulk Removal**: Optimized clearing empty lists by bypassing item-by-item teardown when no async removal hooks are present.
  - **Attribute-based Keying**: Replaced `WeakMap` tracking with `data-atom-key` attributes for O(1) event delegation and reduced memory footprint.
- **Routing Engine (`$.route`)**: Refactored to be natively reactive, aligning deeply with the core engine.
  - **Reactive Rendering**: Removed manual `onParamsChange` in favor of tracked reactivity directly within `render` hooks.
  - **O(1) Link Patching**: Replaced O(N) DOM link queries with reactive link-state patching via a single shared effect.
  - **Memory Safety**: Resolved headless effect leaks via injected `onUnmount` garbage collection handlers.
  - **Performance**: Optimized `getQueryParams` with a query string cache to reduce allocation overhead.
- **Architecture**: Refactored `BindingContext` with lazy jQuery wrapping to avoid unnecessary object allocations during initialization.
- **Modularization**: Reordered `jquery/src` into logical domains (`bindings/`, `core/`, `features/`, `utils/`) for improved maintainability.

#### Fixed

- **Reactivity**: Fixed a bug where mutating nested properties behind a shallow copy in `atomList` failed to trigger a re-render.
- **Race Condition**: Resolved a race condition where `ListItemEntry` objects were returned to the pool before their DOM elements finished asynchronous removal.

#### Removed

- **Legacy Logic**: Removed `getLIS` utility (Longest Increasing Subsequence) as the engine migrated to a flat-buffer move strategy.

## [0.23.0]

### Core

#### Added

- **API**: Added `EffectOptions.name` to easily identify effects during debugging.
- **Internal**: Implemented internal object branding for faster and highly reliable runtime type checks (e.g., `isWritable()`).

#### Changed

- **Performance**: Implemented "Deps-Stable Skip" to achieve zero-allocation O(1) performance when dependencies do not change.
- **Performance**: Resolved severely degraded performance (O(N^2) cliff) in complex dependency graphs.
- **Performance**: Applied extensive engine-level micro-optimizations (array reuse, duck-typing hints) to lower GC pressure and improve JIT compiler execution.
- **Types**: Simplified generic typings and removed redundant defensive type-casting on critical hot paths.

#### Fixed

- **Reactivity**: Fixed a race condition where stale callbacks could still execute if unsubscribed during a concurrent batch update.

#### Removed

- **API**: Removed exported brand symbols (`ATOM_BRAND`, etc.); strictly standardized on runtime type guards (`isAtom`, `isComputed`, etc.).
- **Obsolete Code**: Cleared out unused memory pool configs and legacy dead code for cycle detection.

### jQuery

#### Added

- **Bindings**: Full native support for `<select multiple>` bindings.
- **atomFetch**: Support using reactive getter functions in `ajaxOptions`, making request payloads automatically reactive.
- **IME & Inputs**: Forced synchronous state syncs on `blur` during active IME composition to avoid skipping letters.
- **Integrations**: Multi-root garbage collection capabilities via `enableAutoCleanup`, ideal for Web Components and micro-frontends.
- **Debug Tools**: Visual DOM debugging support now includes SVG elements.
- **Robustness**: Non-DOM Element warnings (`nodeType === 1` guards) added to all chainable jQuery methods.

#### Changed

- **Performance**: Removed slow `instanceof` checks in favor of lightweight O(1) `nodeType` checks across DOM traversals.
- **Performance**: Migrated state bindings to monomorphic records and reduced overhead during descendant cleanups.
- **Lists (`atomList`)**: Rewrote reconciliation loops to correct complex DOM insertion lifecycle bugs and improve security.
- **jQuery Compatibility**: Fortified `.empty()` and `.remove()` overrides to strictly block compatibility crashes with 3rd-party jQuery plugins.
- **Safety**: Wrapped internal binding instantiations inside `untracked()` to avoid unwanted dependency leaking.
- **Types & Architecture**: Unified error message namespaces, hardened generic signatures (`BindingOptions`), and extracted HTML sanitization into a standalone module for safer auditing.

#### Fixed

- **Bugs in Bindings**: Class bindings crashing on tokenized Tailwind classes; lost `aria-*` flags on boolean `bindAttr`; flexible grids mutating on `bindVisibility`.
- **Inputs**: Recovered inputs from skipping synchronization if numeric inputs disallowed `selectionStart`.
- **Radio Buttons**: Sibling radio groups not desyncing appropriately when enclosed atoms updated.
- **atomFetch**: Fixed static API options (`method`, `headers`) being wiped out when mixed with reactive getters.
- **Memory Leaks**: Resolved a global HTML sanitization cache creating 'zombie' subscriber retainment for deleted Computeds.
- **DOM Stability**: Fixed a zombie marker regression on disconnected nodes by ensuring `.cleanup()` forcefully removes tracking classes.

#### Security

- **XSS Protections**: Extended sanitization protocols for `bindProp` to securely close loopholes on object manipulation and SVG `xlink:href` vulnerabilities.
- **Prototype Pollution**: Modernized legacy `for...in` events into `Object.entries()` to shield against object pollution vectors.

## [0.22.2]

### jQuery

#### Changed

- **Performance**: Eliminated iterator and closure overheads (`.each`, `forEach`, `for...of`, `Object.keys/entries`) by adopting native `for` and `for...in` loops in DOM syncs, cleanups, and batch operations. Reduced memory allocations and GC pressure by hoisting configurations and using faster static queries (`getElementsByClassName`).

#### Security

- `sanitizeHtml`: Added entity decoding pre-pass to block `&#NNN;`/`&#xHH;` protocol bypasses; added `-moz-binding` to blocked CSS patterns.

## [0.22.1]

### Core

#### Fixed

- **Async Retry Stability**: Improved the retry counter logic to reset appropriately between separate scheduler updates, preventing false REJECTED states during rapid inputs and slow network conditions.

#### Added

- **Testing**: Tests for async drift scenarios, retry behavior, and `onError` callbacks.

## [0.22.0]

### Core

#### Changed

- **Refactor**: Replaced manual `for` loops with modern array methods (`forEach`, `some`, `includes`, `findIndex`) across the reactive engine for improved readability and maintainability.

### jQuery

#### Changed

- **Architecture**: Refactored package entry and optimized internal binding logic; migrated to `Map`/`WeakMap` for internal caches; optimized iteration performance; hardened reactivity using `untracked` and `peek()`; simplified `BindingRegistry` to SSOT.
- **Rendering & Lists**: Reverted to optimized Regex-based XSS sanitization for 100x performance gain; enhanced `atomList` with LIS-based reconciliation; unified `atomBind` and chainable methods; eliminated redundant DOM cleanups.
- **Bindings & Form Inputs**: Introduced per-instance event namespacing and `INTERNAL_HANDLER` optimization to bypass redundant batching; optimized `InputBinding` with dynamic handler allocation; improved synchronization robustness with selection-range guards.
- **Routing & Networking**: Overhauled `RouterImpl` with navigation guards and read-only state atoms; optimized `autoBindLinks` toggling; enhanced `atomFetch` with abort-safety and eager/lazy request control.
- **Lifecycle & Types**: Standardized `atomMount` ownership with hoisted prop allocations; refined `MutationObserver` auto-cleanup logic; comprehensive `types.ts` overhaul; expanded test suites; refactored visual debug highlights using `requestAnimationFrame`.

## [0.21.3]

### jQuery

#### Added

- **Routing**: `queryParams` atom on `Router` to track URL query parameters reactively.
- **Routing**: `onParamsChange` hook to handle same-route parameter changes efficiently without full re-renders.
- **Lifecycle**: `onMount` lifecycle hook for template-based routes, providing direct access to the rendered jQuery element.

#### Changed

- Consolidated active link tracking into a single effect, significantly reducing memory usage for apps with many navigation links.
- `history.pushState`/`replaceState` failures (e.g., `file://` protocol) now log warnings via `debug` instead of crashing, with strict try-catch guards.

#### Security

- Adopted "Silent Blocking" policy for `sanitizeHtml` and security bindings, removing console warnings.

## [0.21.2]

### Core

#### Added

- **API**: `[Symbol.dispose]()` on `Atom`, `Computed`, and `Effect` for `using` keyword support.

#### Changed

- **Tree-shaking**: Configured Vite to remove debug code in production builds (~6% bundle size reduction).

## [0.21.1]

### Core

#### Changed

- **Naming**: Renamed `SubscriberLink` to `Subscription` to avoid confusion.
- **Reactivity**: `defaultValue` now serves as a fallback for all error types, including non-recoverable ones.
- **Refactor**: Extracted constants and error messages to dedicated files.

#### Fixed

- **Effect Resource Leak**: Failed subscription cleanup after mid-execution errors.

### jQuery

#### Changed

- **Refactor**: Extracted constants, log prefixes, and error messages to `constants.ts`.

## [0.21.0]

### Core

#### Added

- **API**: Brand symbols for robust runtime type identification.
- **Internal**: Bitwise hashing for version snapshots.

#### Changed

- **Compilation**: Adopted ES2021 syntax and updated build targets.

### jQuery

#### Added

- **API**: `$.atomFetch`: Declarative reactive AJAX primitive.

#### Changed

- **Routing**: Migrated routing to native DOM APIs.
- **Reactivity**: Improved reactivity checks using new core brand symbols.

## [0.20.0]

### Core

#### Changed

- **Internal**: Merged epoch counters to simplify tracking.
- **Performance**: Inlined constants and hot-path methods (`_commitDeps`, `_checkLoopWarnings`) to reduce lookup overhead.
- **Core**: Streamlined error collection and removed complex lookup tables in `Computed`.
- **Debug**: Switched effect loop detection to sliding window approach.
- **Performance**: Optimized subscription reuse with linear scanning.

#### Removed

- **Internal**: Internal type wrappers, unused object pools, and redundant properties (`timestamp`, `_modifiedAtEpoch`).

### jQuery

#### Changed

- **Binding**: Refactored chainable methods to use unified binding handlers.
- **Binding**: Standardized `atomChecked` and `bindVisibility` logic.
- **Debug**: Centralized equality checks and optimized debug mode DOM access.
- **Routing**: Switched router to `URLSearchParams` and added `pushState` support.
- **Binding**: Unified array/string value handling in `bindCss`.

## [0.19.1]

### Core

#### Changed

- **Internal**: Replaced global node pollution with local subscription maps for cleaner dependency tracking.

### jQuery

#### Changed

- **Performance**: Refactored `sanitizeHtml` for performance and safety.

#### Security

- Implemented comprehensive XSS protection in bindings (blocking `on*` events and dangerous CSS).

## [0.19.0]

### Core

#### Added

- **API**: `maxAsyncRetries` option to `ComputedOptions`.
- **Profiling**: Stats enablement for `ArrayPool`.

#### Changed

- **Performance**: Optimized `hasError` checks with O(1) lookups.
- **Performance**: Optimized subscriber notification loop.
- **Refactor**: Extracted version arithmetic and flag masks for maintenance.
- **Type Safety**: Improved type safety for empty links.

### jQuery

#### Changed

- **Types**: Refactored `RouteDefinition`, `atomVal`, and `bindVal` for improved type safety.
- **Routing**: Safe URI parsing for malformed URLs in router.

#### Security

- Minimal sanitization for `atomHtml`.
- Added duplicate key warnings in production.

## [0.18.0]

### Core

#### Changed

- **Memory Efficiency**: Replaced `Set` with strict array deduplication for error collection in `ComputedAtom`, and reduced closure allocations in `Effect._isDirty` checks.
- **Internal**: Removed redundant `_fnSubCount` and `_objSubCount` counters from `ReactiveDependency`, simplifying subscriber tracking to use direct array length checks.

### jQuery

#### Added

- **Router**: Introduced `$.route()` for lightweight, hash-based SPA routing with full reactivity support.
  - **Reactive State**: Exposes `currentRoute` as an atom, allowing UI to react instantly to navigation changes.
  - **Lifecycle Management**: Supports `onEnter` and `onLeave` hooks for data fetching and navigation guards.
  - **Automatic Binding**: Declaratively binds links with `data-route` to handle navigation and `active` class toggling automatically.
  - **Template Rendering**: Supports both `<template>` refs and custom render functions for flexible view management.

## [0.17.0]

### Documentation

- **Overhaul**: Major documentation overhaul for improved discoverability and depth.
  - **Core**: Extracted detailed guides into `docs/API.md`, `docs/ARCHITECTURE.md`, and `docs/ONBOARDING.md`. Refined `README.md` for quick start.
  - **jQuery**: Added `docs/API.md` and `docs/PATTERNS.md` for comprehensive API reference and common recipes. Refined `README.md`.
  - **Refactor**: Removed root `ARCHITECTURE.md` in favor of package-specific documentation.

### Core

#### Added

- **Testing**: Expanded unit tests for edge cases including disposal errors, lazy evaluation, and infinite loop detection.

#### Changed

- **Performance**: Optimized core classes with inline property initialization, bitwise masks, and loop streamlining for improved V8 stability.
- **Architecture**: Converted internal utilities to singletons and decomposed complex methods to reduce bundle size and cyclomatic complexity.
- **DX & Maintenance**: Standardized error types, implemented `Symbol`-based debugging, and refined public API documentation.
- **Refactor**: Streamlined internal constants and utility logic (pools, errors) for better maintainability and smaller footprint.

## [0.16.1] - 2026-01-27

### Core

#### Changed

- **Internal**: Replaced parallel arrays with `Link` objects (`DependencyLink`, `SubscriberLink`) to improve data cohesion and cache locality.

## [0.16.0] - 2026-01-27

### Core

#### Changed

- **Performance**: Achieved massive performance gains through V8 hidden class stabilization (monomorphism), property access reduction, and bitwise flag consolidation.
- **Performance**: Micro-optimized tracking and notification loops to minimize call stack depth and branch mispredictions.
- **Memory**: Implemented zero-allocation array reuse (`arr.length = 0`) across `Atom`, `Computed`, and `Effect` to reduce GC pressure.
- **Internal**: Refactored scheduler buffer management and drain cycles for better cache locality and microtask efficiency.
- **Internal**: Hoisted error handlers and internal helpers (e.g., `_addSubscriber`) to improve JIT inlining and code reuse.

### jQuery

#### Changed

- **Performance**: Implemented redundant write guards (`el.textContent !== newVal`) and direct property access to minimize expensive layout reflows.
- **Memory**: Migrated from jQuery's `$.data()` to `WeakMap`-based binding records and debug states, ensuring zero memory leaks and faster lookup.
- **Refactor**: Unified declarative and chainable binding handlers into a shared context, reducing closure nesting.
- **Performance**: Introduced a camel-case property cache to eliminate repeated regex overhead during style updates.
- **Performance**: Optimized shallow equality and path preparation in `atomList` for hardware-friendly propagation.
- **Debug**: Refactored visual highlighting using `requestAnimationFrame` and direct style manipulation for minimal overhead.

## [0.15.4]

### Core

#### Fixed

- **Lazy Computed Sensitivity**: `Effect` would incorrectly skip execution if a dependency was a stale `computed` atom. The execution check now forces a re-evaluation of computed dependencies and re-checks their version.

## [0.15.3]

### Core

#### Added

- **Testing**: Test for circular dependencies in effects.

### jQuery

#### Fixed

- **atomList Edge Cases**:
  - **DOM Cleanup Race Condition**: Fixed a race condition where async `onRemove` callbacks could leave "ghost" elements in the DOM if re-added synchronously. Added `isConnected` checks during reconciliation to correctly handle detached nodes.
  - **Focus Loss on Update**: Implemented shallow equality check for item updates. Prevents unnecessary DOM replacement when the object reference changes but content is identical, preserving input focus during reordering or immutable updates.
  - **Duplicate Key Robustness**: Added warnings for duplicate keys in debug mode and improved reconciliation logic to recover gracefully from key collisions.
  - **Empty Template Typing**: Fixed TS error in empty template logic.

## [0.15.2]

### jQuery

#### Changed

- **atomList**: Enhanced `render` and `empty` options to support `DocumentFragment` and `JQuery` objects.

## [0.15.1]

### jQuery

#### Fixed

- **Debounce Blur Data Loss**: User input was lost when blurring an input field with a pending debounce timer. The `onBlur` handler now flushes pending sync operations before formatting.
- **Zombie Binding Cleanup**: Orphaned `_aes-bound` class markers on cloned elements. `cleanupDescendants` now removes markers from elements with no WeakMap binding data.
- **Cursor Jumping**: Preserved cursor position when an input's atom value is updated externally while focused.
- **State Phase Recovery**: Wrapped state phase transitions in `try...finally` to ensure `state.phase` always resets to `'idle'`.

## [0.15.0]

### Core

#### Fixed

- **Circular Dependencies**: Throws `ComputedError` instead of returning undefined.
- **Effect Errors**: Correctly throws `EFFECT_DISPOSED` and fixed rate limit execution flow.
- **Atom Notifications**: Race condition where notifications were flushed after disposal, preventing `undefined` values from reaching subscribers.
- **Async Effect Cleanup**: Memory leak where stale async cleanup functions could clobber newer ones; implemented execution ID tracking.

#### Changed

- **Debug**: Added warnings for duplicate subscriptions and mismatched batching; optimized production checks.
- **Internal**: Improved object pool resetting, epoch overflow prevention, and type guard simplification.
- **Reactivity**: Enhanced async drift detection using DJB2-style bitwise hash mixing for snapshots.

#### Removed

- Unused private methods, redundant state resets, and duplicate JSDoc.
- Urgent queue system and priority calculation logic from `Scheduler`.
- `isUrgent()` and `_getAggregateShift()` from `ComputedAtomImpl`.
- Obsolete phase-shift constants (`PHASE_BITS`, `PHASE_THRESHOLD`, `PHASE_MASK`).

### jQuery

#### Fixed

- **Debug**: Improved cleanup error logging and registry management for detached nodes.

#### Changed

- **API**: Added custom equality support and unified phase state logic.
- **Type Safety**: Enhanced event handler and binding map type safety, replacing `any` with strong types.
- **Debug**: Ensured static values trigger DOM debug events.
- **Robustness**: Added duplicate key warnings in development mode.

#### Removed

- Unused `effects` context field and redundant variables.

## [0.14.0]

### Core

#### Changed

- **Internal**: Refined subscriber internal storage and notification paths using bitwise flags and pre-initialized arrays.
- **Performance**: Improved state transition logic and dependency checks for more consistent performance.
- **Internal**: Simplified property access and synchronized state flags for improved code clarity.

### jQuery

#### Changed

- **Reactivity**: Wrapped jQuery event handlers in `batch()` to ensure synchronous DOM updates and state consistency.

## [0.13.1]

### jQuery

#### Fixed

- Changed `aes-bound` marker class to `_aes-bound` to avoid potential conflicts with other libraries.

## [0.13.0]

### Benchmarks

- **Overhaul**: Overhauled benchmark suite to prioritize statistical significance and eliminate measurement noise.
  - Migrated micro-benchmarks to batch operations (x1000) for better signal-to-noise ratio.
  - Isolated reactive graph initialization from measurement loops.
  - Introduced Vanilla JS baselines in macro-benchmarks for transparent overhead comparison.
  - Merged redundant micro-benchmarks into core suites.
  - Increased iterations and warmup periods to ensure consistent results (< 5% CV).

### Core

#### Changed

- **Refactor**: Flattened `core/` directory and consolidated all interfaces into a single `src/types.ts` file.
- **Refactor**: Moved `scheduler.ts` and `batch.ts` to `src/internal/`; unified `ReactiveNode` and `ReactiveDependency` into `src/core/base.ts`.
- **Refactor**: Migrated all internal and test imports to `@/` path aliases.
- **Testing**: Refactored core unit tests to eliminate redundancy and improve signal quality.
- **Fixed**: Resolved path errors in `reactive_core.test.ts`.

### jQuery

#### Fixed

- **Double Cleanup**: `$.fn.remove` now marks elements as "ignored" before removal, preventing `MutationObserver` from triggering a second cleanup pass.

#### Changed

- Optimized `cleanupTree` to O(M) (bound elements only) using `AES_BOUND` class marker with `querySelectorAll`.
- Moved `getLIS` (Longest Increasing Subsequence) to `utils.ts` to separate algorithmic complexity from DOM logic.
- Streamlined test suite: merged 13 files into 8 focused suites, eliminating redundancy.
  - Merged `mount.test.ts` + `memory.test.ts` → `lifecycle.test.ts`.
  - Merged `keyed-diffing.test.ts` → `list.test.ts`.
  - `input.test.ts` now covers all two-way bindings, IME, and focus tracking.
  - `chainable.test.ts` slimmed to API surface and method chaining only.

## [0.12.0]

### Core

#### Changed

- **Internal**: Internalized subscriber management within `ReactiveDependency` by removing `SubscriberManager`; `Atom`, `Computed`, and `Effect` now manage subscriber arrays directly.
- **Refactor**: Extracted `EffectExecutionContext` interface to `types/effect.ts`; renamed `_prepareEffectContext()` → `_prepareEffectExecutionContext()`.
- **Internal**: Unified sync/async result handlers in `ComputedAtomImpl` via shared `_finalizeResolution(value: T)` method.

### jQuery

#### Changed

- **Refactor**: Introduced `effect-factory.ts` to centralize reactive binding logic, eliminating ~40% of boilerplate.
- **atomList**: Refactored `atomList` using a structured lifecycle pattern (Empty State, Removal, LIS-Reconciliation, Patching).
- **Type Safety**: Extracted `BindingContext` and removed all `any` types and non-null assertions.
- **Performance**: Migrated high-frequency binding handlers to native DOM properties (e.g., `textContent`, `classList`), bypassing jQuery wrapper overhead.
- **Performance**: Optimized `bindCss` using direct `style` property access for both camelCase and kebab-case.
- **Memory**: Replaced `Object.entries()` with `for...in` loops to eliminate temporary array allocations.
- **Performance**: Switched to native `addEventListener` for general events; lazy element wrapping for reduced jQuery object creation cost.

## [0.11.0]

### Core

#### Added

- **Discrete Phase-Shift Versioning**: 30-bit cyclic phase structure (10-bit Cycle, 20-bit Phase) optimized for V8 Smi. Moved `version` field from `ReactiveDependency` to `ReactiveNode`.
- **Branchless Operations**: `rotatePhase()` for O(1) bitwise rotation; `getShift()` for O(1) modular distance calculation.
- **Urgent Priority Queue**: Jobs exceeding `PHASE_THRESHOLD` are prioritized. Branchless urgency detection.
- **Internal**: `_getAggregateShift()` for tracking total staleness across all dependencies.
- **Async Drift Validation**: Phase drift detection with fail-fast policy (up to `MAX_ASYNC_RETRIES = 3`). Prevents UI flickering from race conditions.

## [0.10.1]

### Core

#### Changed

- **Internal**: Added `ATOM_STATE_FLAGS` and simplified internal logic for `AtomImpl`.
  - Lazy initialization for subscriber managers; streamlined `value` getter/setter; reused notification task closures.

### jQuery

#### Changed

- **Refactor**: Refactored internal logic for `atomList`, `registry`, and chainable methods.
  - Updated `getLIS` and reconciliation loop; optimized `registry` for element tracking; moved invariant checks out of iteration loops.

## [0.10.0]

### Core

#### Changed

- **Refactor**: Clarified `batch(fn)` behavior: emphasizes Synchronous Reflection (immediate flush) and Automatic Microtask Batching.

### jQuery

#### Changed

- **Internal**: Removed redundant `batch()` calls from event handlers and internal synchronization.
- **Documentation**: Updated README to reflect that `atomOn` focuses on automatic lifecycle management.

## [0.9.2]

### Core

#### Changed

- **Documentation**: Removed performance note from README.md.

## [0.9.1]

### Core

#### Changed

- **Architecture**: Overhauled `Scheduler` for true "Automatic Group Updates".
  - Replaced microtask-chaining with a robust `_drainQueue` mechanism.
  - Synchronous updates within the same tick are now gathered into a single microtask execution cycle.
  - Eliminates redundant microtask scheduling and context switching.

## [0.9.0]

### Core

#### Changed

- **Debug**: Optimized Effect loop detection in debug mode using O(1) Circular Buffer.
- **Internal**: Enhanced Epoch system robustness with wrap-around safety check.

#### Added

- `onError` option to `EffectOptions` for handling errors during effect execution.

## [0.8.4]

### Changed

- **Benchmarks**: Overhauled benchmark suite for fairness and accuracy.
  - Lifted object creation out of benchmark loops; replaced static assignments with toggling logic.
  - Added benchmarks for `batch()` throughput and pure Effect re-execution.

## [0.8.3]

### Changed

- **Type Safety**: Introduced `ComputationContext` interface for better type safety in computed atom lifecycle.
- **Refactor**: Reduced duplication in `AtomImpl` and `ComputedAtomImpl` via shared tracking utility.

## [0.8.2]

### Fixed

- **Packaging**: Added `publishConfig.access: public` to `@but212/atom-effect-jquery` to fix NPM payment required error for scoped packages.

## [0.8.1]

### Fixed

- **Packaging**: Scoped `atom-effect-jquery` to `@but212/atom-effect-jquery` to resolve NPM publishing permission errors.

## [0.8.0]

### Changed

- **Monorepo Migration**: Migrated from single-repo to pnpm workspace + Turborepo monorepo structure.
  - Root workspace now manages `packages/core` and `packages/jquery`.
  - Shared tooling: `tsconfig.base.json`, `biome.json` at root level.
  - Turborepo enables parallel builds with dependency-aware caching.
  - `atom-effect-jquery` now uses `workspace:*` for seamless local development.
- **Unified Versioning**: Both packages share the same version number; single `v*` tag deploys simultaneously.
- **Binding**: Extracted shared two-way data binding logic into `applyInputBinding` helper, unifying `$.fn.atomVal` and `bindVal`.
- **Infrastructure**: Added `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json` for workspace configuration.
- **CI/CD**: Updated GitHub workflows (`ci.yml`, `benchmark.yml`, `publish.yml`) for monorepo paths.

## [0.7.0]

### Added

- **Error Propagation**: Automatic error propagation and accumulation through computed value chains.
  - `errors: readonly Error[]` on `ComputedAtom`: immutable array of deduplicated errors from self and all dependencies.
  - `isValid: boolean`: convenience getter (inverse of `hasError`).
  - `hasError` now propagates error status from the dependency chain.
- **Documentation**: `examples/async-propagation.html` — comprehensive demo of declarative async pipeline handling.

### Changed

- **Reactivity**: `ComputedAtom` catches dependency errors and wraps them in `ComputedError`; returns `defaultValue` on recoverable errors for graceful degradation.
- **Internal**: Error deduplication via internal `Set` to prevent duplicate reports in diamond dependency patterns.

### Fixed

- **Reactivity**: Computed values throwing synchronous errors were not registered as dependencies in parent computations.
- **Reactivity**: Async computed values did not correctly propagate error states to downstream dependencies.

### Removed

- Redundant `ComputedStateFlags` and separate handler classes (`SyncComputationHandler`, `AsyncComputationHandler`).

## [0.6.0]

### Added

- **Documentation**: `examples/async-computed-dom.html` — standalone demo showcasing async computed with vanilla DOM manipulation.

### Changed

- **Reactivity**: All async computed state getters (`.state`, `.hasError`, `.lastError`, `.isPending`, `.isResolved`) now trigger dependency tracking via `_registerTracking()`.
- **Documentation**: Updated CDN options to use `unpkg` and `jsdelivr`.

### Fixed

- **Reactivity**: `_handleAsyncResolution` now calls `_notifyJob()` after async computation completes, ensuring effects re-execute.

## [0.5.1]

### Changed

- **Performance**: Relaxed Scheduler limits to support higher-frequency updates and complex dependency graphs.
  - `MAX_EXECUTIONS_PER_EFFECT`: 50 → **100**
  - `MAX_EXECUTIONS_PER_SECOND`: 100 → **1000**
  - `MAX_EXECUTIONS_PER_FLUSH`: 5000 → **10000**
  - `CLEANUP_THRESHOLD`: 100 → **1000**

## [0.5.0]

### Changed

- **Refactor**: Centralized utility functions into `src/utils/` (`ArrayPool`, `type-guards`, `error`).
- **Type Safety**: Introduced `DependencyId` branded type for strict ID typing.
- **Breaking**: `batch` and `untracked` now propagate original errors instead of wrapping in `AtomError`.

## [0.4.0]

### Changed

- **Internal**: Streamlined `Atom`, `Computed`, and `Effect` implementations; removed unused variables and redundant type checks.
- **Refactor**: Renamed `_notify()` to `_scheduleNotification()`; optimized `Computed` hot paths.
- **Type Safety**: Refactored dependency tracking with user-defined type guards (`hasDependencyMethod()`, `isPlainListener()`, `hasExecuteMethod()`, `isTrackableFunction()`), replacing unsafe `as` type assertions.

## [0.3.3]

### Added

- **Testing**: Comprehensive memory and stability tests (`gc-verification`, `circular-reference`, `fuzz`).

### Changed

- **Refactor**: Moved internal modules (`pool.ts`, `epoch.ts`, `scheduler/`) to `src/internal/`.
- **Documentation**: Reduced excessive JSDoc comments across 7 core files (~1,200 lines removed).

### Fixed

- Computed caching bug where `_setIdle()` in `_markDirty()` cleared the RESOLVED flag.

## [0.3.2] - 2026-01-09

### Changed

- **Architecture**: Implemented "Push-State, Pull-Value" reactive propagation pattern.
  - **Internal**: `Computed._markDirty()` propagates dirty flags synchronously without scheduler registration.
  - **Refactor**: Removed `_recomputeJob` field (lazy recomputation via `value` getter).
  - **Performance**: `Computed.version` only increments when value actually changes (respects `equal` option).

## [0.3.1] - 2026-01-09

### Changed

- **Memory**: Replaced `Map` with `Array` for `_subscriptions` in `Computed` and `Effect`.
- **Performance**: Replaced `Set` with epoch check for `_modifiedDeps` in `Effect`.
- **Internal**: `Computed` now implements `Subscriber` interface for direct object subscription.
- **Debug**: `debug.checkCircular` now uses epoch-based traversal.

## [0.3.0] - 2026-01-09

### Added

- `maxExecutionsPerFlush` option to `EffectOptions` to prevent infinite loops in complex dependency graphs.

### Changed

- **Performance**: Applied branchless optimizations (bitwise masking) to `Computed` and `Effect` state management hot paths.

## [0.2.2] - 2026-01-08

### Changed

- Updated README.md

## [0.2.1] - 2026-01-08

### Changed

- **Performance**: Replaced `WeakMap` with pure array-based lookup in `SubscriberManager`.

## [0.2.0] - 2026-01-04

### Changed

- **Performance**: Zero-allocation dependency tracking via pooled arrays; O(1) epoch-based deduplication; V8 Smi optimization. `Computed` creation time reduced **34%**, `Effect` **17%**, GC pressure **20%** lower.
- **Stability**: Strictly enforced `IDLE` → `BATCHING` → `FLUSHING` scheduler lifecycle. `Computed`/`Effect` retain valid dependencies after execution failure.

### Removed

- `DependencyManager` (refactored into internal logic).

## [0.1.5] - 2026-01-02

### Changed

- **Bundling**: Optimized build output: bundled type definitions into `index.d.ts`; standardized `package.json` paths with `./dist/` prefix.

## [0.1.4] - 2026-01-02

### Changed

- **Performance**: Enforced strict property initialization order in `ComputedAtomImpl` for V8 Hidden Class Monomorphism.

## [0.1.3] - 2026-01-02

### Changed

- **Performance**: Implemented "Delta Sync" (Diffing) in `Effect` and `Computed` to minimize subscription churn.
- **Performance**: Refactored `DependencyManager` to use strong references; optimized `Scheduler` with double buffering.
- **Refactor**: Replaced `AtomImpl`'s custom subscription logic with `SubscriberManager`.

### Fixed

- **Reactivity**: Infinite loops caused by synchronous self-modification were not detected due to delayed subscription.

## [0.1.2] - 2026-01-01

### Changed

- **Documentation**: Updated README.md

## [0.1.1] - 2026-01-01

### Changed

- **Documentation**: Updated installation command in README.md

## [0.1.0] - 2025-12-31

### Added

- **Initial Release**: Initial release.
- **Core**: Core primitives: `atom`, `computed`, `effect`, `batch`, `untracked`.
- **General**: Zero dependencies, full TypeScript support.
- **Internal**: Object pooling, circular dependency detection, infinite loop protection.
- **Testing**: Comprehensive test suite (200+ test cases).
