# Changelog

## [Unreleased]

### Core

#### Refactor

- **Buffers**: Standardized `SlotBuffer` and `DepSlotBuffer` API to match standard JavaScript collections (Array-like).
  - Renamed `size` -> `length`, `physicalSize` -> `capacity`, `add` -> `push`, and `getAt` -> `at`.

### Documentation

- **Standards**: Established formal TSDoc and inline comment conventions in `docs/conventions/code_documentation_conventions.md`.
- **Core & jQuery**: Applied comprehensive documentation across both packages, focusing on audience segmentation (User vs. Contributor) and the "3-Second Rule".
- **Internal Logic**: Added specialized annotations (`Logic:`, `Optimization:`, `Constraint:`, `Reason:`) to explain V8 optimizations, security measures, and architectural decisions.

### jQuery

#### Added

- **Diagnostic Warnings**: Integrated unregistered custom element detection in `$.route`, `$.useAtomComponent`, and `$.injectAtom` when `debug.enabled` is true.
- **Global Configuration**: Introduced `$.initAEJ` for centralized control over library behavior, allowing granular toggling of jQuery patches and custom `MutationObserver` safety-net roots.
- **Web Components**: Introduced `useAtomComponent` for high-performance reactive integration with Custom Elements.
  - **Lens Factory API**: Exposed `attrs` and `slots` as functional Lens Factories (e.g., `attrs('name')`), leveraging core `atomLens` for fine-grained reactivity and better type safety.
  - **Single Source of Truth**: Optimized internal state to use a single source atom per category (Attributes/Slots), drastically reducing memory overhead and synchronization complexity.
  - **Scoped Selector (`$`)**: Added a component-aware jQuery selector that automatically isolates lookups to the active ShadowRoot or host element.
  - **Metadata Access**: Exposed `host` and `root` properties on the controller for precise DOM control.
  - **Slot Tracking**: Added reactive monitoring of `assignedNodes()` via `slotchange` events, enabling components to react to projected content.
  - **Closed Shadow DOM Support**: `setup({ shadowRoot: sr })` now robustly supports closed shadow roots, including deferred slot tracking.
  - **Attribute Snapshot Optimization**: `attrs()` now respects `static observedAttributes` if defined, drastically reducing memory by only tracking relevant attributes.
  - **Re-hydration**: `teardown()` now removes `data-aej-bind` markers, allowing the same DOM nodes to be safely re-hydrated if `setup()` is called again.
  - **Scheduler Integration**: Optimized observers to rely on the global scheduler's auto-batching, ensuring efficient, synchronized updates.
- **Dependency Injection (DI)**:
  - **Event-Based Discovery**: Migrated context resolution to a bubbling `CustomEvent` (`aej:context-request`) with `composed: true`, ensuring 100% reliability across Shadow DOM boundaries.
  - **Hybrid Discovery Proxy**: Injected atoms now use a dual-mode resolution: Reactive (subscribing to hierarchy moves) and Synchronous (immediate discovery on `.value` access).
  - **Context Automation**: Unified hierarchy move detection into a single `ContextEngine.version` atom, triggered by a global `MutationObserver`.
  - **Late Binding**: Added support for late-bound reactive context in Custom Elements, enabling `injectAtom` to work correctly during element construction before DOM connection.
  - **Type Safety**: Added generic type support (`provideAtom<T>`, `injectAtom<T>`) for improved IDE autocompletion and type checking.
- **CSS Bridge**: Added a "CSS Bridge" feature to `provideAtom`, automatically synchronizing provided values to CSS custom properties (e.g., `--aej-key`) for direct styling integration.

#### Changed

- **Memory Management**: Overhauled the auto-cleanup engine to support multiple roots and explicit opt-out via `initAEJ`.

#### Fixed

- **Navigation**: Resolved a race condition where pending async hooks could overwrite state after a subsequent navigation.

#### Refactor

- **Test Infrastructure**: Modularized the monolithic integration test suite into specialized categories (`features`, `synergy`, `routing`, `core`, `scenarios`, `lifecycle`) for improved maintainability and stability.
- **ESM Modernization**: Migrated configuration files to use `import.meta.dirname` for better ESM compatibility and standardized `@/` path aliases across the monorepo.
- **Core Overrides**: Modularized jQuery prototype patches (`jquery-patch`) to allow independent enabling of event-wrapping and lifecycle-sync hooks.

## [0.31.0]

### Core

#### Added

- **Scheduler**: Introduced `aeNextTick()` for precise internal and external scheduler synchronization.

#### Removed

- **Compatibility**: Removed `[Symbol.dispose]` support from all primitives to maintain ES2021 compatibility.

### jQuery

#### Added

- **PJAX Navigation**: Introduced `$.atomNav` for seamless page transitions with automatic title, meta-tag, and attribute synchronization.
- **Dynamic Routing**: Added support for dynamic route segments (e.g., `:id`) and a reactive `params` atom to `$.route`.
- **Navigation Control**: Enhanced `navigate()` with Promise support, `replace` options, and cancellation via `AbortSignal`.
- **Routing**: Support for `HTMLElement` and `JQuery` objects as injection targets in `$.route`, along with `title` metadata for automatic document title updates.
- **Server-Side**: `X-PJAX-URL` header support for handling redirects during navigation.

#### Changed

- **Architecture**: Reorganized `constants.ts` into focused subsystem namespaces for better modularity.
- **Performance**: Optimized reactive bindings by operating directly on native `HTMLElement` nodes.
- **Engines**: Overhauled `InputBinding` (strategy-based) and Security (data-driven) architectures.
- **Reactivity**: Unified async race-condition protection via `createAsyncRunner`.
- **Lifecycle**: Enhanced `atomMount` with "Fail Loud" initialization and structured `ComponentLifecycle` support.
- **Interception**: Improved link handling to respect modifier keys, external links, and download attributes.
- **Standardization**: Unified `$.nextTick` to use core's `aeNextTick()` for consistent scheduling.

#### Fixed

- **Navigation**: Resolved state synchronization issues during PJAX redirects.
- **Fetch**: Fixed dynamic HTTP method resolution in `$.atomFetch`.
- **Diagnostics**: Clarified `atomList` duplicate key warnings.

#### Removed

- **Internal**: Removed shared `DOMParser` singleton to prevent global state leaks.
- **Legacy**: Cleaned up internal type exports (`RenderRoute`, `TemplateRoute`) and redundant abstractions.

#### Security

- **Sanitization**: Hardened `sanitizeHtml` with multi-layered defense, including `srcset` and `srcdoc` cleaning.
- **Hardening**: Neutralized DOM Clobbering attacks via element prototype descriptors.
- **CSS Security**: Implemented comment-aware CSS sanitization and protocol validation.
- **Decorum**: Improved auditability of blocked handlers in `data-unsafe-attr`.

## [0.30.1] - 2026-04-14

### Core

#### Fixed

- **Lens**: Added prototype pollution protection in `setDeepValue` and `getPathValue` for `__proto__`, `constructor`, and `prototype` keys.

### jQuery

#### Fixed

- **Core**: Fixed bug in `unpack` utility where static values were not identified in `[source, options]` tuples.
- **Security**: Updated `sanitizeHtml` for XSS bypasses using case-sensitive or semicolon-less entities.
- **Security**: Added `srcdoc` to monitored URL attributes.
- **Security**: Updated protocol detection for `url(javascript:...)` in SVG and CSS.
- **Security**: Refined CSS sanitization regex.

#### Refactor

- **Bindings**: Consolidated security guards for `on*` handlers and dangerous properties into a unified `isSafeBinding` helper in `bindAttr` and `bindProp`.
- **Sanitization**: Centralized and optimized the security regex engine in `sanitize.ts` for better maintainability.

#### Changed

- **Performance**: Updated `atomEachElement` engine to cache context requirements and collection length.

## [0.30.0] - 2026-04-12

### Core

#### Added

- **Atom**: Added `equal` property to `AtomOptions` for custom equality parity with `computed`.
- **Error Handling**: Added `AtomError.getChain()` and `AtomError.toJSON()` for programmatic tracing and structured logging.
- **Error Handling**: Exported `AtomErrorConstructor` to standardize error instantiation.
- **API**: Added `[Symbol.dispose]` support to all primitives for explicit resource management (TS 5.2+).

#### Fixed

- **Computed**: Resolved sync error propagation bug where subscribers missed notifications on failed evaluations.
- **Computed**: Isolated `hasError`/`errors` getters in `untracked` scope to prevent internal dependency leakage.
- **Atom**: Fixed "Net-Zero" update bug; notifications are no longer sent if values return to their original state during batches.
- **Atom**: Corrected re-entrancy notification order using a breadth-first `while` loop in `_flushNotifications`.
- **Error Handling**: Fixed context loss in `wrapError` and preserved raw throwable values in `cause`.
- **Debug**: Fixed memory leaks in `trackUpdate` and `dumpGraph` via `WeakRef` and microtask cleanup.
- **Scheduler**: Fixed job ignoring during active flushes and resolved nested flush state corruption.
- **Scheduler**: Eliminated memory leaks by nullifying job references and prevented stack crashes via flat execution loops.
- **Effect**: Fixed `this` binding leak in `EffectImpl`.

#### Changed

- **Error Handling**: Enhanced `AtomError` with machine-readable codes and `recoverable` policy overrides.
- **Debug**: Integrated `Error.captureStackTrace` and implemented a zero-overhead `DebugController` with monomorphic singleton swapping.
- **Tracking**: Hardened `TrackingContext` to detect/warn when returned `Promise` objects might leak dependencies.
- **Performance**: Consolidated reactive identification into a bitwise `BRAND` symbol flag system.
- **Performance**: Optimized V8 hidden class stability by explicitly initializing all members in constructors.
- **Performance**: Masked `ReactiveNode.id` to Small Integer (SMI) range for faster bitwise operations.
- **Performance**: Production builds now fully strip `debug.warn` calls and related overhead.
- **Types**: Improved `Paths<T>` for nullable properties and simplified `EffectFunction` for better inference.

#### Refactor

- **Buffers**: Consolidated `SlotBuffer` and `DepSlotBuffer` for better cache locality and GC efficiency.
- **Core**: Reorganized state flags into a partitioned 31-bit layout optimized for V8.

### jQuery

#### Added

- **Core**: `enableAutoCleanup` now supports `ShadowRoot` and `DocumentFragment` roots.
- **API**: Added `[source, formatter]` tuple support for `atomText`.
- **List Rendering**: Refactored `atomList` for multi-root element support and concurrent async removals.
- **Fetch**: Enhanced `$.atomFetch` with automatic abortion and specialized resource cleanup.

#### Fixed

- **Core**: Resolved race condition in `MutationObserver` attachment during early initialization.
- **Reactivity**: Enhanced event patching for `$.fn.one()` and added cross-instance compatibility.
- **Reactivity**: Recursively clean up all bindings in `atomUnbind`.
- **Utils**: Fixed thenable detection in `isPromise` and SVG element support in `getSelector`.
- **Debug**: Fixed highlight persistence/fading issues and standardized logger state checks.
- **Internal**: Hardened `ArrayPool`/`ObjectPool` with double-release protection.
- **Security**: Fixed XSS sanitization bypasses and protocol smuggling via encoded characters.

#### Changed

- **Lifecycle**: `$.fn.atomMount` now auto-cleans existing components and uses `batch()` for atomic updates.
- **Bindings**: Optimized `atomClass` for space-separated names and `atomShow`/`atomHide` for display style preservation.
- **Performance**: Implemented local value caching in property/attribute bindings to minimize DOM churn.
- **Performance**: Added resolution caching to `registerMapEffect` for redundant async dependencies.

## [0.29.0] - 2026-04-07

### Core

- **Breaking**: Removed `maxAsyncRetries` in `computed`; drift now naturally triggers re-evaluation via `_markDirty()`.
- **Performance**: Replaced DJB2 hashing with a unified `_isDirty` mechanism, reducing core complexity.
- **Internal**: Flattened directory structure (removed `internal/`, `tracking/`, `errors/`) into high-cohesion modules.

### jQuery

- **Added**: Enhanced `atomForm` with `debounce`, `transform`, `onChange` hooks, and deep path support.
- **Changed**: Re-implemented form binding via `FormBinder` for circular protection and O(1) dispatch.
- **Internal**: Merged pool sets and refactored test suites for behavior-driven verification.

## [0.28.0] - 2026-04-03

### Core

- **Added**: Official lens support (`atomLens`, `lensFor`) with recursive dot-path types.
- **Performance**: Optimized lens write paths with identity guards to prevent redundant propagation.

### jQuery

- **Performance**: Applied CPU Branch Prediction (BP) optimizations, including monomorphic dispatch and strategy specialization.
- **Performance**: Added a fast-path scanner to `sanitizeHtml` for safe strings (~5x speedup).
- **Encapsulation**: Migrated lens core to the main package and restricted public jQuery exports to the `$` namespace.

## [0.27.0] - 2026-03-31

### Core

- **Performance**: Aggressive engine-level optimization pass:
  - SVO Unrolling to eliminate closure overhead in hot loops.
  - Class-based singletons for `trackingContext` and `debug` to stabilize V8 hidden classes.
  - Bitwise status management and local variable caching for reduced property lookups.

### jQuery

- **Refactor**: Major overhaul removing 1,000+ lines of redundant logic via monomorphic structures.
- **Performance**: Hoisted allocations and switched to native loops/selectors (`getElementsByClassName`) for speed.
- **Robustness**: Improved error isolation in `$.route` and `atomFetch`.

## [0.26.0] - 2026-03-24

- **Core**: Added infinite loop detection and exception-safe `runInFlushScope` wrappers.
- **jQuery**: Optimized `atomForm` for O(1) scaling on large forms.

## [0.25.0] - 2026-03-17

- **jQuery**: Added native `Promise` support to content/attribute bindings and implemented DOM metadata caching.

## [0.24.1] - 2026-03-10

- **Core**: Unified `_isDirty()` mechanism and stabilized V8 hidden classes.
- **jQuery**: Initial `$.fn.atomForm` release with nested path support.

## [0.24.0] - 2026-03-03

- **Core**: Bit-packed slot buffers and stable-skip re-evaluation (O(1)).
- **jQuery**: Overhauled `atomList` with a 1D Flat Buffer strategy and typed arrays.

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
- **Internal**: `_getAggregateShift()` for tracking total staleness across all dependencies.
- **Async Drift Validation**: Phase drift detection with fail-fast policy (up to `MAX_ASYNC_RETRIES = 3`). Prevents UI flickering from race conditions.

## [0.10.1]

### Core

#### Changed

- **Internal**: Added `ATOM_STATE_FLAGS` and simplified internal logic for `AtomImpl`.
  - Lazy initialization for subscriber managers; streamlined `value` getter/setter; reused notification task closures.

### jQuery

#### Changed

- **Refactor**: Reorganized internal modules (`jquery-patch`, `chainable`, `list`, `route`) to improve element tracking and move invariant checks out of iteration loops.

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
