# Changelog

## [Unreleased]

### Core

#### Fixed

- **Reactivity**: Resolved critical regressions in `Computed` (async state leaks, stack overflows) and `Effect` (cleanup tracking, infinite loop false-positives).
- **Core Engine**: Transitioned `Atom` to iterative synchronous notifications and hardened `SlotBuffer` synchronization to prevent state loss and stack overflows.
- **Scheduler**: Resolved re-entrancy bugs during synchronous flushes and addressed memory leaks in queue overflows.
- **Lens**: Refactored as a first-class `ReactiveNode` to support O(1) path flattening and fine-grained reactivity.
- **Internal**: Corrected `isPromise` detector to robustly identify Thenables in both function and object forms.

#### Changed

- **Error System**: Standardized diagnostic formatting (`Type (Context): Message`) and improved debugging with `Error.captureStackTrace` and context-preserving `wrapError` logic.
- **V8 Optimization**: Optimized engine for hidden class monomorphism and hardened all internal counters (ID, Epoch, Version, Promise ID) using 31-bit SMI-safe limits (`0x3fffffff`).
- **Internal Architecture**: Refactored `ReactiveNode` flags into a disjoint bitmask partition (Bits 0-3 for node identification) to eliminate state collisions and improve dispatch performance.
- **Type Safety**: Strengthened `Paths<T>` inference, `subscribe` signatures, and implemented `unique symbol` for internal sentinels in `symbols.ts`.
- **Diagnostics**: Standardized internal debugging API (`debug.warnIf`) to provide consistent telemetry across core modules.

### jQuery

#### Added

- **Core**: Officially expanded `enableAutoCleanup` support to `ShadowRoot` and `DocumentFragment`.
- **API**: Introduced `[source, formatter]` tuple support in `atomText` and enhanced `$.atomFetch` with automatic abortion on disposal.
- **List Rendering**: Major `atomList` refactor supporting multiple roots and concurrent async removal handling.
- **Routing**: Optimized history mode stability and improved `basePath` prefix matching.

#### Fixed

- **Core**: Resolved initialization race conditions in `MutationObserver` and settled potential null pointer errors during early boot.
- **Reactivity**: Hardened jQuery event patching for `one()` and corrected recursive cleanup logic in `atomUnbind`.
- **Security**: Reinforced XSS sanitizers (SVG attributes/protocols), entity decoding order, and froze configuration constants.
- **Debug**: Fixed outline persistence on detached elements and stabilized highlight fade-out transitions.
- **Internal**: Hardened `ArrayPool` and `ObjectPool` with double-release protection to prevent memory pressure.

#### Changed

- **Performance**: Implemented JS-level value caching for DOM bindings and O(1) scaling for `atomForm` through manager-based dispatching.
- **Architecture**: Unified DOM utilities and overhauled internal registries to eliminate module fragmentation and closure overhead.
- **Lifecycle**: Improved `$.fn.atomMount` atomicity using `batch()` and integrated `isDisposed` checks into all binding factories.

#### Performance

- **Caching**: Implemented local JS-level value caching in `bindHtml`, `bindClass`, `bindCss`, and `bindProp` to minimize redundant DOM reads and writes.
- **Async Optimization**: Implemented a resolution cache in `registerMapEffect` to reuse resolved Promise values, enabling synchronous updates for redundant async dependencies.

#### Internal

- **Reliability**: Extracted radio group synchronization logic into a unified `syncRadioGroup` helper using `$.escapeSelector`.

#### Security

- **Hardening**: Reinforced non-element node skipping logic and refined logging during registration phases to prevent silent failures.
- **Sanitization**: Added missing SVG URL attributes (`fill`, `filter`, `mask`, `marker-*`, `clip-path`) to the default sanitization registry.
- **Hardening**: Centralized `DANGEROUS_PROTOCOL_PATTERN` in `constants.ts` and hardened the regex-based sanitizer against whitespace-obfuscated protocols.

## [0.29.0] - 2026-04-07

### Core

#### Breaking Changes

- **Removed**: `maxAsyncRetries` option in `computed`. Computation drift now naturally triggers re-evaluation (`_markDirty()`) without an arbitrary limit, ensuring reactive consistency during async resolution cycles.

#### Performance

- **Simplicity**: Simplified internal dirty checking by removing redundant DJB2-based hashing in favor of a unified `_isDirty` mechanism, reducing core complexity by ~120 lines.
- **Buffers**: Merged `SlotBuffer` and `DepSlotBuffer` in `src/core/buffers.ts` to improve cache locality and simplify buffer management.

#### Internal

- **Architecture**: **Directory Flattening & Consolidation**.
  - Eliminated redundant `internal/`, `tracking/`, and `errors/` subdirectories to reduce module fragmentation and import depth.
  - Consolidated fragmented logic into unified high-cohesion modules: `errors.ts`, `scheduler.ts`, and `tracking.ts`.

### jQuery

#### Added

- **API**: **Enhanced `atomForm` Binding**.
  - Added support for `FormOptions`: `debounce`, `transform`, and `onChange` hooks.
  - Improved deep path support (e.g., `user.profile.age`, `items[0].text`).
  - Automated lifecycle: Full support for dynamic control addition, removal, and renaming via `MutationObserver`.
  - Native support for radio groups and checkbox groups with auto-mapping.
  - Advanced configuration support via `[atom, options]` tuple in `atomBind`.

#### Changed

- **Performance**: Re-implemented form binding via `FormBinder` manager for robust circular protection and O(1) dispatcher performance.

#### Internal

- **Architecture**: **Directory Flattening & Consolidation**.
  - Flattened `internal/` subdirectory to simplify package structure.
  - `src/utils/pool.ts`: Merged array and object pool sets to simplify internal abstractions.
- **Testing**: Refactored `form.test.ts` suite to prioritize behavior-driven verification over implementation details.

## [0.28.0]

### Core

#### Added

- **API**: **Official Lens Support**.
  - `atomLens`: Two-way reactive "view" into nested state with 100% structural sharing and zero-render impact.
  - `composeLens` / `lensFor`: Composition utilities and high-performance recursive object manipulation.
  - **Types**: High-performance recursive dot-path types (`Paths<T>`, `PathValue<T, P>`) with 8-level depth and exact type inference.

#### Changed

- **Performance**: Optimized lens write paths with `Object.is` identity guards to prevent redundant propagation.
- **Reliability**: Ensured `setDeepValue` is non-destructive and reference-stable for unchanged branches.

### jQuery

#### Changed

- **Performance**: CPU Branch Prediction (BP) optimization pass.
  - **Monomorphic Dispatch**: Replaced `if` chains in `atomBind` with a bitmask-based constant-time dispatch table and integer LSB indexing via `Math.clz32`.
  - **Zero-overhead Debugging**: Removed `debug.enabled` guards by swapping loggers with No-op pointers at runtime.
  - **Strategy Specialization**: Eliminated element-type branching in `InputBinding` via construction-time strategy specialization.
  - **Sanitization Fast-path**: Added O(n) scan to bypass regex pipelines for safe strings (~5x faster updates).
  - **Registry Stability**: Transitioned to static array snapshots for cleanup, stabilizing loop prediction and BTB pressure.
- **Robustness**: Improved `debug` mode with dynamic console synchronization (`window.__ATOM_DEBUG__`).
- **Encapsulation**: **Architecture Consolidation**.
  - Migrated core lens implementation and recursive types to `@but212/atom-effect` for universal utility.
  - Hardened package interface by restricting public exports strictly to the `$` namespace and `$.fn` extensions.
  - Re-exported all lens utilities via the jQuery namespace to maintain seamless backward compatibility.

## [0.27.0] - 2026-03-31

### Core

#### Changed

- **Performance**: Executed an aggressive engine-level optimization pass.
  - **SVO Unrolling**: Manually unrolled hot loops for subscriber notifications and dependency collection (Small Vector path) to eliminate closure overhead.
  - **Monomorphic Singletons**: Refactored `trackingContext` and `debug` into class-based singletons and unified common reactive state into `ReactiveNode` for stable V8 hidden classes.
  - **Hot-path Density**: Transitioned status management to direct bitwise operations and implemented local variable caching to reduce property lookup depth.
  - **Internal**: Optimized scheduler batching, error paths, and `untracked()` fast-paths for minimal overhead.

### jQuery

#### Changed

- **Refactor**: Major overhaul of `@but212/atom-effect-jquery` architecture, removing 1,000+ lines of redundant logic through monomorphic structures and streamlined registry management.
- **Performance**: Significant engine-level optimizations:
  - Reduced memory overhead by hoisting allocations and using manual loops instead of `Object.keys()`.
  - Accelerated hot-paths via specialized construction-time logic and faster microtask scheduling (`Promise.resolve()`).
  - Improved DOM performance using targeted selectors (`getElementsByClassName`) and fast-path text sanitization.
  - Optimized router and fetch internal loops and object merges.
- **Robustness**: Hardened type safety and improved error isolation in `$.route` and `atomFetch`.
- **Fixed**: Corrected `atomFetch` header merging to prevent dynamic options from overwriting static headers.

#### Documentation

- **Sync**: Updated `API.md` and `ARCHITECTURE.md` to reflect refined internal types and optimized reconciliation engines.

## [0.26.0]

### Core

- **Reliability**: Added infinite loop detection and `runInFlushScope` Exception-safe wrappers.
- **Performance**: Optimized `SlotBuffer` with O(1) stack-based index reuse and enhanced `DepSlotBuffer` relocation.

### jQuery

- **API**: Introduced `$.atomLens` and `$.lensFor` for type-safe, two-way deep state management.
- **Performance**: Optimized `atomForm` for O(1) scaling on large forms via centralized dispatching.

## [0.25.0]

### jQuery

- **API**: Added native `Promise` support to all content and attribute bindings.
- **Performance**: Implemented metadata and value caching for DOM bindings to minimize property lookup overhead.

## [0.24.1]

### Core

- **Performance**: Stabilized V8 hidden classes via monomorphic constructors and optimized dispatch loops.
- **Performance**: Unified `_isDirty()` mechanism to replace redundant hashing in async drift detection.

### jQuery

- **API**: Added `$.fn.atomForm` for automated form binding with nested path support.

## [0.24.0]

### Core

- **Performance**: Bit-packed versioned slot buffers and stable-skip re-evaluation for O(1) efficiency.
- **Refactor**: Unified dependency tracking inside the `ReactiveNode` hierarchy.

### jQuery

- **List Rendering**: Overhauled `atomList` with a 1D Flat Buffer strategy and typed arrays for GC-free updates.
- **Routing**: Refactored `$.route` to be natively reactive with O(1) link patching.

## [0.23.0]

### Core

- **Performance**: Zero-allocation O(1) stable-skip re-evaluation and engine-level micro-optimizations.
- **Safety**: Hardened internal object branding and refined generic typings.

### jQuery

- **Bindings**: Native support for `<select multiple>` and reactive `ajaxOptions` in `atomFetch`.
- **Performance**: Migrated to monomorphic records and lightweight `nodeType` checks.

## [0.22.2]

### jQuery

- **Performance**: Switched from iterators to native `for`/`for...in` loops to reduce closure overhead.
- **Security**: Hardened HTML sanitization against protocol-bypass vectors.

## [0.22.1]

### Core

- **Stability**: Refined async retry logic and expanded test coverage for drift scenarios.

## [0.22.0]

### Core

- **Refactor**: Modernized internal loops with array methods for better maintainability.

### jQuery

- **Architecture**: Optimized internal binding registry and migrated to faster Regex-based sanitization.
- **Routing**: Overhauled router with navigation guards and abort-safe fetching.

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
  - **`key`**: `keyof T | (item, index) => string | number` (Required) — Property name or function returning a unique ID for diffing.
  - **`render`**: `(item, index) => string | Element | DocumentFragment | JQuery` — HTML string, DOM element, DocumentFragment, or jQuery object for new items. Supports multiple root elements (e.g. `<i></i><b></b>`).
  - **`bind`**: `($el, item, index) => void` — One-time reactive binding logic for the element.
  - **`update`**: `($el, item, index) => void` — Updates existing elements manually when the key remains the same (optimizes to avoid re-binding).
  - **`onAdd`**: `($el) => void` — Called after an item is added to the DOM.
  - **`onRemove`**: `($el) => Promise<void> | void` — Called before removal (supports async exit animations).
  - **`empty`**: `string | Element | DocumentFragment | JQuery` — Content to show when the list is empty.
  - **`isEqual`**: `(oldItem, newItem) => boolean` — Custom equality check for item updates (defaults to shallow comparison).
  - **`events`**: `Record<string, (item, index, e) => void>` — Delegated event handlers attached to the container. One listener per event type. Key format: `'eventType' or 'eventType selector'`. Handler called with `(item, index, event)`.
  - **Modularization**:
    input-binding.ts  — Two-way input binding with IME/debounce/cursor support
    form.ts           — Fully automated form binding with lens-based deep paths
    list/             — Modularized atomList implementation
      index.ts        — Main entry point and effect registration
      diff.ts         — Keyed diffing algorithm with prefix/suffix trimming
      dom.ts          — DOM manipulation, rendering, and empty state handling
      context.ts      — ListContext for managing state and async removals
      types.ts        — Internal types and interface definitions
    mount.ts          — atomMount / atomUnmount component lifecycle
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
- **Internal**: `_getAggregateShift()` for tracking - **Cancellation**: Only the latest "Promise ID" is allowed to resolve. This prevents slow, stale responses from overwriting newer results.

- **Async Drift Validation**: Phase drift detection with fail-fast policy (up to `MAX_ASYNC_RETRIES = 3`). Prevents UI flickering from race conditions.

## [0.10.1]

### Core

#### Changed

- **Internal**: Added `ATOM_STATE_FLAGS` and simplified internal logic for `AtomImpl`.
  - Lazy initialization for subscriber managers; streamlined `value` getter/setter; reused notification task closures.

### jQuery

#### Changed

- **Refactor**: Refactored internal logic│  jquery-patch.ts ← jQuery patches │
│  chainable.ts ← $.fn methods      │
│  bindings/list/ ← Modular list    │
│  route.ts     ← SPA router        │
element tracking; moved invariant checks out of iteration loops.

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
