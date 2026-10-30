# Changelog

> [!NOTE]
> Releases 0.1.0 – 0.29.0 are archived in [docs/archive/changelog](./docs/archive/changelog/).

## [0.35.1]

### Core

#### Fixed

- **Computed**: Stale async rejections are suppressed; pending invalidations during async evaluation trigger immediate recomputation.
- **Tracker**: Session epochs are decoupled from scheduler deduplication; active dependencies are deduplicated if an epoch is clobbered by child tracking. Declared `_nextEpoch` instance field for V8 monomorphism.
- **Scheduler**: Active scheduler execution state flags are preserved during nested `flushSync` calls.
- **Atom**: Pending notifications are recorded after notifying computed subscribers to prevent stale re-entrancy.
- **Lens**: `cloneAndSet` preserves prototype-less objects created via `Object.create(null)`.

#### Changed

- Removed obsolete tracking helpers in `base.ts`.
- Exported `Subscriber` and `SubscriberTarget` types from the public entry point.

### jQuery

#### Fixed

- **atomList**: Sparing and reconnect operations reset `isKept` flags to prevent detached node memory leaks.
- **atomList**: Keyed reconciliation guards head indices when duplicate keys are encountered.
- **atomList**: `DocumentFragment` empty placeholders are cloned on insertion; non-element nodes are ignored.
- **atomForm**: Bound controls are tracked so child bindings are properly cleaned up on form rebind, and the unbind cache is cleared.
- **atomForm**: `MultiSourceField` detaches source listeners upon disposal, and safely guards callback execution and object subscriber `.execute` calls.
- **atomForm**: Two-way input bindings are torn down when the control's `name` attribute is removed.
- **Lifecycle**: `$.fn.remove` defers `markIgnored` until after `cleanupTree` finishes, allowing same-tick rebinds.
- **Lifecycle**: Auto-cleanup supports non-HTML `Element` nodes (e.g. SVG elements).
- **Security**: `sanitizeHtml` detects spaced `expression(...)` patterns and blocks multi-URL declarations in CSS; SVG `attributeName` casing is normalized.
- **Unified**: Removed redundant `change` event listener registration in `bindChecked`.

#### Deprecated

- Deprecated `DisposableWritableAtom` type alias in favor of `WritableAtom`.

### Utils

#### Fixed

- **SlotBuffer**: Indices in `at()`, `setAt()`, and `truncateFrom()` are clamped to `0` when negative values are passed.

## [0.35.0]

### Core

#### Fixed

- Effect: stale async cleanups and rejections no longer overwrite state or report after a newer execution or disposal.
- Flush-session budget is decoupled from scheduler queue dedup; fixes duplicate same-cycle executions and nested-flush warnings.
- Lens: duplicate subscriptions no longer leak root listeners; writes to disposed lenses are inert.
- `{ sync: true }` atom: a subscriber that writes back to its own atom now reports `SchedulerError` and drops the pending notification, instead of looping forever. The round counter is frame-local (no per-atom state).
- Lens rooted at a merged lens throws on write and still reads normally (previously broadcast sub-path writes to every source). Whole-value writes to the merged lens are unchanged.

#### Changed

- Invalid `subscribe()` listeners throw `AtomError` directly, not via an internal `Result`. Behavior unchanged.
- Option validation in `atom()`, `scheduler.maxFlushIterations`, `batch()`, and the internal computed value-state check throw directly, not via `Result`. Behavior unchanged.
- `getErrorMetadata`: plain objects with a `_tag` ending in `Error` are no longer special-cased; they report `name: 'Unexpected error'`, `recoverable: true`, and no `code`. `AtomError` subclasses are unaffected.
- Lens path helpers moved to their own module; both lens classes share one subscription implementation. Public exports unchanged.
- Removed internal pass-through wrappers (`nextVersion`, `nodeIsDirty`, `nodeIsShallowDirty`, `prepareTracking`, `nextEpoch`, `getCurrentFlushEpoch`, `trackEvaluationFailure`) and unused internal re-exports in `core/index.ts`. Public exports and benchmarks unchanged.

### jQuery

#### Removed

- **BREAKING** `$.atomLens`, `$.composeLens`, `$.lensFor`, `$.mergeLenses`, `$.mergeAtoms`, `$.isComputed`, `$.isEffect`, `$.untracked`. Import from `@but212/atom-effect`. See [MIGRATION.md](./MIGRATION.md).
- **BREAKING** `$.atomNav` (PJAX), its `AtomNav`/`AtomNavOptions` types, and the internal `navCoordinator`. See [MIGRATION.md](./MIGRATION.md).
- `examples/all` PHP/PJAX demo (depended on `atomNav`).
- **BREAKING** `$.route`, `$.atomFetch`, `$.provideAtom`, `$.injectAtom`, `$.useAtomComponent`, the `route`/`fetch`/`web-component` features, and their types (`RouteConfig`, `RouteDefinition`, `RouteLifecycle`, `Router`, `FetchOptions`, `FetchError`, `AtomComponentController`, `JQueryScopedSelector`). For remote data use `$.computed` with `fetch`. Routing and Custom Element integration are no longer provided. See [MIGRATION.md](./MIGRATION.md).

#### Changed

- No behavior change: `atomList` item mounting and the effect factory share helpers; binding warnings use `debug.warn`.
- Internal `normalizePath` (form field names) renamed `formNameToPath`.
- Internal helpers with no consumers outside their module are no longer exported.
- No behavior change: form field atoms share one delegation base; the auto-cleanup lifecycle has a single owner.

#### Fixed

- **atomList**: `onRemove` runs once per removed item (previously twice).
- **atomForm**: in a multi-atom form, a field write mutates only the owning source (the last source defining the path, else the first). Previously it broadcast to every source and corrupted siblings.
- **atomForm**: field ownership is resolved per operation, so a field shared by several sources follows the path as sources gain or drop it (previously pinned at mount).
- **atomForm**: an empty source array throws a named error at the binding boundary (previously an unrelated `TypeError`).
- `JQuery`/`JQueryStatic` type augmentations (`$.atom`, `.atomText`, …) now ship in package declarations (previously missing from `dist`). `atomCss` is typed against `CssValue`.

### Utils

#### Removed

- **BREAKING** `Result.isOk`, `match`, `expect`, `unwrapOr`, `unwrapOrElse`, `map`, `mapErr`, `andThen`, `tryAsync`, `equals`, `all`, `fromPredicate`, `fromThrowable`, and `isResult()` with its brand symbols. The engine uses only `ok`, `err`, `isErr`, `unwrap`, `tryCatch`. Use `result.ok` instead of `isOk()`.

#### Fixed

- Package publishes `dist` only (`"files": ["dist"]`); sources and tests were previously included.

### Documentation

- Removed pointer-only `API.md`, `ARCHITECTURE.md`, `LIFECYCLE.md`, `SECURITY.md` package pages. `docs/spec/` is the single normative source.
- Merged each package's `BENCHMARKS_DETAILED.md` into `BENCHMARKS.md`; `scripts/update-benchmarks.js` updates that one file.
- `packages/configs` has no build step; it ships plain ESM JavaScript.

## [0.34.1]

### Core

- **Effect**: Async cleanup sessions are invalidated when a newer execution starts, so stale promises can't install cleanup after a later synchronous run.
- **Computed**: Disposal releases computation, equality, default-value, and error-handler state; the cached `peek()` value is preserved.
- **Scheduler**: `onOverflow` receives dropped jobs as a second argument: `onOverflow(droppedCount, droppedJobs)`.
- **Scheduler**: Dropped jobs are re-queued exactly once after an overflow. A recurring overflow stays terminal until a clean drain re-arms recovery.
- **Scheduler**: The flush microtask re-arms whenever the queue is non-empty, so jobs scheduled during a drain or from `onOverflow` always run.
- **Identity**: Docs describe process-local 31-bit counters with modulo rollover, not lifetime-unique IDs.

### jQuery

- **Web Components**: Context proxy subscriptions observe existing providers, provider changes, and DOM topology changes. Temporary computed and observer resources are released on unsubscribe/disposal.
- **Web Components**: Provider CSS sync is owned by one provider record. Replacement and teardown dispose stale effects; direct providers join registry cleanup.
- **Web Components**: Context lifecycle docs reflect shared revision invalidation and `RootObserver` cleanup (replacing the removed `ContextEngine` ref-counting).
- **atomList**: Duplicate-key items render (with a warning) instead of being dropped.
- **atomList**: Snapshots superseded by duplicate-key re-renders are torn down through normal `onRemove`, so no DOM nodes are orphaned.
- **atomList**: Pending removals are tracked by node identity, not key. A live item sharing a duplicate key is patched in place, not re-rendered, while its superseded twin's async `onRemove` is pending.
- **Sanitizer**: DOM parsing, traversal, serialization, node replacement, and text/attribute access use captured native prototype methods, resisting instance-level DOM clobbering.
- **atomNav**: Fetched `<form>` elements become `<span>` wrappers under the default navigation sanitization policy.

### Utils

- **Result**: `isResult()` validates both brands and the full Ok/Err field shape; malformed or getter-throwing objects are rejected.

### Documentation

- **Specifications**: Core, jQuery, and utils contracts synced with the implementation (scheduler budgets, rollover, sanitizer guarantees, radio lookup, cold-start insertion, SlotBuffer mutation).

## [0.34.0]

### Core

#### Breaking Changes

- **Error Handling**: Removed deprecated `AtomError.getChain()` and `AtomError.toJSON()` instance methods.

  **How to Migrate?**

  Replace instance calls with standalone functions from the core package.

  _Before:_

  ```typescript
  const chain = error.getChain();
  const json = error.toJSON();
  ```

  _After:_

  ```typescript
  import { getErrorChain, serializeError } from '@but212/atom-effect';

  const chain = getErrorChain(error);
  const json = serializeError(error);
  ```

### jQuery

#### Breaking Changes

- **Web Component Architecture & DI**: Redesigned as a minimal, stateless architecture.
  - **Explicit Setup Required**: The engine no longer auto-runs `setup()` for components with static properties (`aejStyles`, `aejBind`, etc.). Call `this.aej.setup()` in `connectedCallback()`.

    _How to Migrate:_

    ```typescript
    class MyComponent extends HTMLElement {
      static aejStyles = [':host { color: red; }'];
      private aej = $.useAtomComponent(this);

      connectedCallback() {
        this.attachShadow({ mode: 'open' }); // if needed
        this.aej.setup(); // EXPLICIT CALL REQUIRED
      }
    }
    ```

  - **Stateless DI (DOM Traversal)**: `injectAtom` and `provideAtom` resolve contexts by synchronous DOM traversal (`parentNode` and `ShadowRoot.host`) instead of `aej:context-request` events. Consumers must be structural DOM descendants of their providers. Stop relying on `aej:context-request`.
  - **Strict Type Safety for Proxies**: `injectAtom` and `createContextProxy` return `WritableAtom<T | null> | null` (previously `WritableAtom<T> | null`). Handle nullability explicitly.

    _How to Migrate:_

    ```typescript
    const themeProxy = $.injectAtom<string>(this, 'theme');
    if (themeProxy && themeProxy.value !== null) {
      console.log(themeProxy.value.toUpperCase());
    }
    ```

## [0.33.1]

### jQuery

#### Changed

- Extracted `applyNavigationState` in `atomNav` to handle PJAX DOM updates and history sync.
- `ContextEngine.discover` uses a direct parent-pointer DOM walk across Shadow DOM boundaries, falling back to bubbling `CustomEvent` dispatch.
- `batchSanitize` integrates `sanitizeCache`, skipping parsing and attribute scrubbing for cached dynamic HTML templates.
- Binding-registry `cleanupDescendants` uses an O(1) class-presence check (`getElementsByClassName`) to skip recursive `querySelectorAll` scans on clean subtrees.
- Radio sync uses a scoped `WeakMap` cache of active radios grouped by form or document, replacing global `find` scans. Checked-state sync is O(1).
- Debug style-block insertion checks are throttled to once per 1000ms.

#### Fixed

- `atomNav` preserves `<form>` elements during PJAX navigation via a navigation sanitization policy. Nested scripting, unsafe attributes, and DOM clobbering vectors stay neutralized.
- `sanitize.ts` hardened with early-return fast paths for URIs, entity decoding, and normalization. Attribute iteration no longer allocates intermediate arrays.

## [0.33.0]

### Core & Infrastructure

#### Added

- `ErrorStrategy`: data-driven standardized error metadata extraction.
- Standard node ID prefixes (`atom_`, `calc_`, `fx_`) with lifecycle tracking via `FinalizationRegistry`.
- `satisfies` constraints on internal config objects for compile-time contract checks.
- `BUFFER_FLAGS` bitmask on `DepBufferState` for extensible state encoding (initial flag: `HAS_COMPUTEDS`).

#### Changed

- Dual-layer encapsulation for all reactive nodes: engine-visible fields (`flags`, `version`, `_storage`) are public class properties; behavioral state (values, computation functions, cleanup handles) uses native `#` private fields.
- `ReactiveTrackingEngine` class replaced by a plain `TrackingContext` object and standalone functions (`pushTrackingSubscriber`, `popTrackingSubscriber`, `rollbackTrackingSubscriber`).
- `DependencyBuffer` methods decomposed into module-level functions. The `Indexer` abstraction is replaced by a nullable `Map<Dependency, number>`, lazily created above `MAP_THRESHOLD` and released when the buffer shrinks below it.
- `isDirty`/`isShallowDirty` unified into `checkDirty(state, deep)`. The `hasComputeds` boolean is replaced by a `flags` bitmask on `DepBufferState`.
- `maxExecutionsPerFlush` and `maxExecutionsPerSecond` consolidated into `EffectBudgetState`. Abort messages come from an `ABORT_MESSAGES` lookup table.
- `ComputedAtomImpl.#recompute()` uses a single try-catch with inline tracking rollback, matching `EffectImpl.execute()`.
- Disposal and notification-lock checks inlined across `AtomImpl`, `ComputedAtomImpl`, and `EffectImpl`.
- `debug.attachDebugInfo` in `AtomImpl` is guarded by `IS_DEV` and skipped in production.
- Subscriber notification loop uses pre-hoisted strategy references and direct `KIND`-based dispatch.
- Engine split into `core/base.ts` (tracking) and `core/scheduler.ts` (job execution).
- Global resources reorganized into `src/constants/` and `src/types/`.
- `atomLens` auto-flattens nested state paths.
- Reactive node storage (`slots`, `deps`) consolidated into `_storage` for hidden-class stability.

#### Removed

- `ReactiveTrackingEngine` class, `nodeIsDisposed` helper, `Indexer`/`NullIndexer`/`MapIndexer` types, and `DependencyBuffer` proxy functions.

#### Deprecated

- `AtomError.getChain()` and `AtomError.toJSON()` instance methods. Use `getErrorChain()` and `serializeError()`. Removal scheduled for v0.34.0.

#### Breaking Changes

- **Build System**: Build split into `types`, `lib` (ESM/CJS), and `bundle` (UMD) targets. Direct `dist/` file references may need updates.
- **Error Handling**: `AtomErrorConstructor` and `AtomErrorJSON` types moved to the core types module.

  **How to Migrate?**

  Update imports that reference internal paths or specific error modules:

  ```typescript
  // Correct import
  import type { AtomErrorConstructor, AtomErrorJSON } from '@but212/atom-effect';
  ```

### jQuery

#### Added

- **PJAX Navigation**: `$.atomNav` gains standard PJAX headers (`X-PJAX-Container`, `X-PJAX-Title`) and protocol coordination. Parsing handles full pages, partial fragments, and inner HTML responses.

#### Changed

- Integration layer and diagnostic controller migrated to an ES2022 architecture with private class fields.
- `ListContext` converted from an interface to an encapsulated class.
- `atomEachElement` modernized; property checks use `Object.hasOwn`.
- `atomFetch` error normalization includes the original error as `cause`.
- Binding registry: scoped tree disposal and better memory safety for detached nodes.
- Source comments use structured annotations for design intent and optimization rationale.

#### Fixed

- **atomList**: Internal sentinel handling during `batchSanitize` is stable under concurrent rendering.
- **Diagnostics**: Log prefixes standardized; debug-mode highlighting is more reliable.

#### Breaking Changes

- **Packaging**: `@but212/atom-effect` is externalized in ESM and CJS builds and must be a peer dependency. Install it in your project.
- **CDN**: Default CDN entry point changed. Use the explicit UMD bundle path instead of the package base URL.

  _How to Migrate:_ update `<script>` tags:

  ```html
  <!-- Before -->
  <script src="https://cdn.jsdelivr.net/npm/@but212/atom-effect-jquery@0.33.0/index.js"></script>

  <!-- After (Recommended) -->
  <script src="https://cdn.jsdelivr.net/npm/@but212/atom-effect-jquery@0.33.0/dist/atom-effect-jquery.min.js"></script>
  ```

## [0.32.1]

### jQuery

#### Added

- **atomForm**: Multi-atom support (`mergeLenses`), granular `transform`/`onChange` hooks, `debounce`, and native integration with **FACE** and the **Constraint Validation API**.

#### Changed

- **Performance & Architecture**: `atomList` and `atomForm` engines overhauled.
  - 3-pass reconciliation (head/tail optimization, keyed diffing, greedy placement): O(N) with less memory overhead.
  - Core logic uses functional object contexts and unified structural binding via `lensFor` and `mergeLenses`.

#### Fixed

- **Build**: The AEJ bundle now includes the `atom-effect` core, fixing several related issues.

## [0.32.0]

### Core

#### Changed

- `atomLens` and `setDeepValue` support `Map`, `Set`, and custom class instances with full prototype preservation.
- Added `mergeAtoms` and `mergeLenses` for reactive state composition.
- `trackEvaluationFailure` added to the debug system to record dependency dirty-check failures.
- Loop detection deduplicates warnings to avoid console clutter.
- `Paths` and `PathValue` moved to `core/lens.ts`.

#### Added

- `mergeAtoms` in `computed.ts` flattens multiple reactive sources into one object.
- `mergeLenses` in `lens.ts` unifies multiple writable lenses into a two-way bound object.

#### Security

- `atomLens` and `setDeepValue` block restricted keys such as `__proto__`, preventing prototype pollution.

### Utils

#### Breaking Changes

- `Result` and `Option` redesigned from class hierarchies to functional object literals. Static utility calls replace method calls.
- `SlotBuffer` API: `size` → `length`, `physicalSize` → `capacity`, `add` → `push`, `getAt` → `at`.

#### Added

- `Option` and `Result` primitives with static utilities (`match`, `tap`, `andThen`, `tryCatch`, `fromPromise`).
- `isResult` type guard for nominal type identification.
- Logic and structural type utilities (`Equal`, `If`, `Merge`, `Prettify`, etc.).
- `vitest bench` performance benchmarks for utilities.

#### Changed

- `SlotBuffer` uses bit-scan slot discovery; redundant hooks removed from `truncateFrom`.
- `Result` and `Option` use symbol-based nominal type checks.

#### Fixed

- `Result.isErr` no longer misidentifies `Promise` objects as `Err` (type-level edge case).

### jQuery

#### Breaking Changes

- Minimum jQuery version raised to `4.0.0`.

#### Added

- **Reactive Web Components**: `$.useAtomComponent` and an orchestration engine featuring:
  - Shadow DOM support and global `CSSStyleSheet` caching.
  - Form-Associated Custom Elements (FACE) integration with native validation.
  - Reactive attribute and slot monitoring via `atomLens`.
  - Synchronous `teardown` for deterministic disposal.
- **Dependency Injection (DI)**: Context system re-engineered with Shadow DOM transparency and debounced move detection (`ContextEngine`).
- **CSS Bridge**: Reactive values sync to CSS custom properties (`--aej-*`) on host elements.
- **atomForm**: Declarative form binding with O(1) field scaling and native Constraint Validation.
- **Diagnostics**: Debug mode detects unregistered custom elements and duplicate controllers.
- **Routing**: Native `URLPattern` support and extra route comparison options in `$.route`.

#### Changed

- `atomNav` and `$.route` use a central coordinator and modular routing with `AbortSignal` management.
- Hot paths (binding resolution, element iteration) use native `for` loops instead of high-level array methods.
- `@but212/atom-effect-jquery` drops its `Option`/`Result` dependencies in performance-critical modules.
- Chainable bindings and attribute transforms use unified factories.
- Improved reconciliation in `atomList` and field discovery in `atomForm`.
- CJK IME input bindings don't interrupt composition during reactive updates.
- All features use the new functional `Result` utility.

#### Security

- `sanitizeHtml` re-engineered with an inert parsing strategy and better entity decoding to prevent XSS.
- Constants use `satisfies` for type-level contract checks.
- `SYSTEM_COMPONENT.ATTRS` updated for internal attribute management.

#### Fixed

- Navigation race: pending async hooks can no longer overwrite state.

### Documentation & Infrastructure

#### Added

- TSDoc conventions and architectural annotations.
- JSDoc examples and design docs for core utilities.

#### Changed

- Codebase migrated to standard ESM; `@/` path aliases standardized.
- Integration test suite modularized; validation logic centralized.

## [0.31.0]

### Core

#### Added

- **Scheduler**: `aeNextTick()` for precise scheduler synchronization between internal and external code.

#### Removed

- **Compatibility**: `[Symbol.dispose]` removed from all primitives to keep ES2021 compatibility.

### jQuery

#### Added

- **PJAX Navigation**: `$.atomNav` for page transitions with automatic title, meta-tag, and attribute sync.
- **Dynamic Routing**: Dynamic segments (e.g., `:id`) and a reactive `params` atom in `$.route`.
- **Navigation Control**: `navigate()` supports Promises, `replace`, and `AbortSignal` cancellation.
- **Routing**: `HTMLElement` and `JQuery` objects as injection targets in `$.route`; `title` metadata updates `document.title`.
- **Server-Side**: `X-PJAX-URL` header handles redirects during navigation.

#### Changed

- **Architecture**: `constants.ts` split into focused subsystem namespaces.
- **Performance**: Bindings operate directly on native `HTMLElement` nodes.
- **Engines**: `InputBinding` (strategy-based) and security layers overhauled.
- **Reactivity**: Async race protection unified in `createAsyncRunner`.
- **Lifecycle**: `atomMount` uses "fail loud" initialization and structured `ComponentLifecycle`.
- **Interception**: Link handling respects modifier keys, external links, and `download` attributes.
- **Standardization**: `$.nextTick` uses core's `aeNextTick()`.

#### Fixed

- **Navigation**: State sync issues during PJAX redirects resolved.
- **Fetch**: Dynamic HTTP method resolution in `$.atomFetch` fixed.
- **Diagnostics**: `atomList` duplicate-key warnings clarified.

#### Removed

- **Internal**: Shared `DOMParser` singleton removed (global state leak).
- **Legacy**: `RenderRoute` and `TemplateRoute` type exports and redundant abstractions removed.

#### Security

- **Sanitization**: `sanitizeHtml` hardened with multi-layer defense, including `srcset` and `srcdoc` cleaning.
- **Hardening**: DOM Clobbering neutralized via element prototype descriptors.
- **CSS Security**: Comment-aware CSS sanitization and protocol validation.
- **Decorum**: Blocked handlers in `data-unsafe-attr` are easier to audit.

## [0.30.1] - 2026-04-14

### Core

#### Fixed

- **Lens**: `setDeepValue` and `getPathValue` block `__proto__`, `constructor`, and `prototype` keys.

### jQuery

#### Fixed

- **Core**: `unpack` now identifies static values in `[source, options]` tuples.
- **Security**: `sanitizeHtml` handles case-sensitive and semicolon-less entity XSS bypasses.
- **Security**: `srcdoc` added to monitored URL attributes.
- **Security**: `url(javascript:...)` detected in SVG and CSS.
- **Security**: CSS sanitization regex refined.

#### Refactor

- **Bindings**: `on*` handler and dangerous-property guards unified into `isSafeBinding` in `bindAttr` and `bindProp`.
- **Sanitization**: Security regex engine in `sanitize.ts` centralized and optimized.

#### Changed

- **Performance**: `atomEachElement` caches context requirements and collection length.

## [0.30.0] - 2026-04-12

### Core

#### Added

- **Atom**: `equal` option in `AtomOptions` for custom equality, matching `computed`.
- **Error Handling**: `AtomError.getChain()` and `AtomError.toJSON()` for tracing and structured logging.
- **Error Handling**: `AtomErrorConstructor` exported for standardized error construction.
- **API**: `[Symbol.dispose]` on all primitives for explicit resource management (TS 5.2+).

#### Fixed

- **Computed**: Sync error propagation fixed; subscribers no longer miss notifications on failed evaluations.
- **Computed**: `hasError`/`errors` getters run in `untracked` scope to prevent dependency leaks.
- **Atom**: "Net-zero" update bug fixed; no notification when a batch returns a value to its original state.
- **Atom**: Re-entrant notification order corrected with a breadth-first `while` loop in `_flushNotifications`.
- **Error Handling**: `wrapError` keeps context; raw throwables preserved in `cause`.
- **Debug**: Memory leaks in `trackUpdate` and `dumpGraph` fixed via `WeakRef` and microtask cleanup.
- **Scheduler**: Jobs ignored during active flushes fixed; nested flush state corruption resolved.
- **Scheduler**: Job references nulled to prevent leaks; flat execution loops prevent stack overflows.
- **Effect**: `this` binding leak in `EffectImpl` fixed.

#### Changed

- **Error Handling**: `AtomError` has machine-readable codes and `recoverable` policy overrides.
- **Debug**: `Error.captureStackTrace` integrated; zero-overhead `DebugController` with monomorphic singleton swapping.
- **Tracking**: `TrackingContext` warns when a returned `Promise` may leak dependencies.
- **Performance**: Reactive identification consolidated into a bitwise `BRAND` symbol flag system.
- **Performance**: All members initialized in constructors for V8 hidden-class stability.
- **Performance**: `ReactiveNode.id` masked to the SMI range.
- **Performance**: Production builds fully strip `debug.warn` and related overhead.
- **Types**: `Paths<T>` handles nullable properties; `EffectFunction` simplified for better inference.

#### Refactor

- **Buffers**: `SlotBuffer` and `DepSlotBuffer` consolidated for cache locality and GC efficiency.
- **Core**: State flags reorganized into a partitioned 31-bit layout.

### jQuery

#### Added

- **Core**: `enableAutoCleanup` supports `ShadowRoot` and `DocumentFragment` roots.
- **API**: `[source, formatter]` tuple support in `atomText`.
- **List Rendering**: `atomList` supports multi-root elements and concurrent async removals.
- **Fetch**: `$.atomFetch` auto-aborts and cleans up resources.

#### Fixed

- **Core**: `MutationObserver` attachment race during early initialization fixed.
- **Reactivity**: `$.fn.one()` event patching fixed; cross-instance compatible.
- **Reactivity**: `atomUnbind` cleans up all bindings recursively.
- **Utils**: `isPromise` thenable detection and SVG support in `getSelector` fixed.
- **Debug**: Highlight persistence and fading fixed; logger state checks standardized.
- **Internal**: `ArrayPool`/`ObjectPool` protected against double release.
- **Security**: XSS bypasses and protocol smuggling via encoded characters fixed.

#### Changed

- **Lifecycle**: `$.fn.atomMount` auto-cleans existing components and uses `batch()`.
- **Bindings**: `atomClass` handles space-separated names; `atomShow`/`atomHide` preserve display style.
- **Performance**: Property and attribute bindings cache local values to reduce DOM churn.
- **Performance**: `registerMapEffect` caches resolutions for redundant async dependencies.
