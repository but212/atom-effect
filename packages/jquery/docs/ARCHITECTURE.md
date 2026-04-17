# Architecture & Design

This document explains the internal mechanics of `@but212/atom-effect-jquery`. It is intended for developers who want to understand how the jQuery integration layer works or contribute to the package.

## 1. Overview

The jQuery package is a **thin reactive binding layer** on top of `@but212/atom-effect` core. It does not reimplement any reactive primitives — it bridges them to the DOM via jQuery.

```text
                 ┌───────────────────────────────────┐
                 │       @but212/atom-effect         │
                 │  atom / computed / effect / batch │
                 └──────────────┬────────────────────┘
                                │
                 ┌──────────────▼────────────────────┐
                 │    @but212/atom-effect-jquery     │
                 │                                   │
                 │  unified.ts   ← Binding handlers  │
                 │  effect-factory.ts ← Effect reg.  │
                 │  registry.ts  ← Lifecycle mgmt    │
                 │  jquery-patch.ts ← jQuery patches │
                 │  chainable.ts ← $.fn methods      │
                 │  bindings/list/ ← Modular list    │
                 │  route.ts     ← SPA router        │
                 │  mount.ts     ← Component mount   │
                 │  core/dom.ts  ← Core DOM engine   │
                 └───────────────────────────────────┘
```

## 2. Binding Pipeline

Every reactive binding follows the same pipeline:

```text
$.fn.atomText(atom)
  → chainable.ts (jQuery method)
    → unified.ts: bindText(ctx, atom)
      → effect-factory.ts: registerReactiveEffect(el, source, updater)
        → core: effect(() => { updater(source.value) })
        → registry.trackEffect(el, effectInstance)
```

### 2.1 Effect Factory

`registerReactiveEffect` (`effect-factory.ts`) is the centralized entry point that creates a core `effect` and registers it with the binding registry:

- If the source is **reactive** (atom/computed): creates an `effect` that reads `.value` and calls the updater.
- If the source is **static**: calls the updater once immediately (no effect created).
- **Async Support**: If the value (from atom or static source) is a **Promise**, `registerReactiveEffect` handles the resolution automatically. It includes race condition protection using numeric `latestId` tracking to ensure only the most recently assigned promise's result is applied to the DOM.
- **Zombie Prevention**: Every effect registration includes an `isDisposed` flag managed by `registry.trackCleanup`. This ensures that async callbacks (promises) return early if the element has been removed from the DOM, preventing memory leaks and stale updates.

This eliminates boilerplate across all binding types and ensures robust, memory-safe async behavior.

### 2.2 Binding Context & DOM Engine

`createContext(el)` and `atomEachElement(jq, fn)` in `core/dom.ts` provide the base engine for all reactive bindings:

- **Binding Context**: Provides a shared context object per element, including a `trackCleanup` helper.
- **DOM Engine (`atomEachElement`)**: The central iterator used by all chainable methods. It handles jQuery sets, filters for `HTMLElement` (skipping text/comment nodes), and provides lazy context creation only when required (`needsCtx: true`). The loop is optimized by caching context flags and length to minimize property lookups in hot paths.
- **Unpack Utility**: A shared utility used by `atomBind` and other integrated bindings to handle `[source, options]` tuple arguments. It uses a **look-ahead heuristic** on the second element to differentiate between tuples and 2-element array values, enabling support for static source data.

The lazy `$el` getter in `unified.ts` (when using `atomOn`, etc.) avoids unnecessary jQuery object creation for bindings that only need native DOM access.

### 2.3 Unified Binding (`atomBind`)

`atomBind` dispatches to focused handler functions:

```text
atomBind({ text, html, class, css, attr, prop, show, hide, val, checked, on })
  → bindText, bindHtml, bindClass, bindCss, bindAttr, bindProp,
    bindVisibility, bindVal, bindChecked, bindEvents
```

Each handler is a standalone function that receives a `BindingContext` and the reactive value. This decomposition keeps cyclomatic complexity low and enables tree-shaking.

#### 2.3.1 Performance Optimizations in Bindings

To achieve maximum performance during high-frequency updates (e.g., animations or rapid state changes), `unified.ts` implements several optimizations:

- **Metadata Caching**: Complex bindings like `atomClass`, `atomCss`, `atomAttr`, and `atomProp` pre-calculate metadata (e.g., camelCase property names, ARIA flags, URL-bearing status) during the initial registration. Map objects for these bindings are **hoisted outside the element iteration loop** to avoid redundant object allocations.
- **Monomorphic Dispatch**: The internal `InputBinding` class specializes its `format` and `equal` logic at construction time. This removes branching and `instanceof` checks from the high-frequency `syncToDom` and `syncToAtom` paths.
- **JS-Level Value Caching**: `bindHtml`, `bindClass`, `bindCss`, `bindProp`, and `bindAttr` maintain a local JS-side cache of the last written value. This avoids expensive DOM reads (like `el.innerHTML`) and redundant DOM writes (like `classList.add` or property assignments) when the reactive state hasn't meaningfully changed.
- **Batched Map Updates**: `registerMapEffect` processes entire dictionaries of reactive values in a single effect, reducing the number of total `Effect` objects and improving subscription efficiency.
- **Resolution Caching**: `registerMapEffect` implements a `resolvedCache` to store previously resolved Promise values. When a reactive dependency in a map changes, the factory re-uses cached values for already-resolved promises instead of triggering new `Promise.all` cycles, enabling synchronous updates for redundant async dependencies.

## 3. Lifecycle Management

### 3.1 Binding Registry

The `BindingRegistry` (`registry.ts`) is the central lifecycle manager. It tracks:

- **Effects**: Core `effect` instances bound to DOM elements.
- **Cleanups**: Arbitrary cleanup functions (event listeners, timers, etc.).

Storage uses **WeakMap/WeakSet** to prevent memory leaks. To reduce GC pressure, the `BindingRecord` objects used to store these resources are acquired from and released to a **Hardened LIFO Object Pool**. This pool implements mandatory resource resetting and **Orchestration**, where a record's disposal automatically returns its internal `effects` and `cleanups` arrays to their respective specialized pools.

### 3.2 Marker Class Optimization

Bound elements receive a `_aes-bound` CSS class marker. This enables O(M) cleanup via `getElementsByClassName('_aes-bound')` where M is the number of bound elements, instead of O(N) traversal of all descendants. This approach is significantly faster than `querySelectorAll` as it avoids the CSS selector parsing engine and returns a live `HTMLCollection`.

### 3.3 Auto-Cleanup via MutationObserver

`enableAutoCleanup(root)` installs a `MutationObserver` on the specified `root` (Element, ShadowRoot, or DocumentFragment) that watches for removed nodes. For the global DOM, this is lazily initialized via `ensureAutoCleanup()` upon registering the very first reactive binding. The logic is robust against early initialization; it performs a safety check for `document.body` and gracefully recovers if the binding occurs before the body is ready. Multiple roots can be observed concurrently (e.g., for micro-frontends).

```text
DOM Removal Detected
  → Is element type? (skip text/comment nodes)
  → Is still connected? (skip moves within DOM)
  → Is preserved? (skip .detach())
  → Is ignored? (skip .remove() already handled)
  → registry.cleanupTree(element)
    → cleanupDescendants(el)  // Cleanup all _aes-bound descendants
    → cleanup(el)             // Cleanup the element itself
```

### 3.4 Shadow DOM

The global `MutationObserver` (on `document.body`) does not cross Shadow DOM boundaries. However, `enableAutoCleanup` now supports `ShadowRoot` as a root element. If you use Web Components, you can call `enableAutoCleanup(this.shadowRoot)` in `connectedCallback` to enable automatic cleanup within that shadow subtree, or manually call `registry.cleanupTree(this.shadowRoot)` in `disconnectedCallback`.

### 3.5 jQuery Method Patches

`enablejQueryOverrides()` (`jquery-patch.ts`) patches core jQuery methods:

| Method | Patch Behavior |
| ------ | -------------- |
| `.remove()` | Calls `cleanupTree` + marks as ignored before original removal |
| `.empty()` | Calls `cleanupDescendants` before original empty |
| `.detach()` | Marks elements as "kept" (preserves bindings for re-attach) |
| `.on()` | Wraps handlers in `batch()` for automatic update coalescing. Supports maps and `.one()`. |
| `.off()` | Resolves wrapped handlers via WeakMap for correct unbinding |

The `.on()` and `.one()` patches use `Symbol.for('atom-effect-internal')` to mark wrapped handlers, ensuring compatibility across different library instances or bundles.

The `.on()` patch ensures that multiple atom writes inside a single jQuery event handler are batched into one synchronous flush:

```javascript
$btn.on('click', () => {
  count.value++;    // Batched
  name.value = 'x'; // Batched
}); // Both updates flush here as one
```

## 4. Two-Way Input Binding

`applyInputBinding` (`input-binding.ts`) implements full-featured two-way binding:

```text
┌──────────┐    input/change     ┌──────────┐
│   DOM    │  ─────────────────▶ │   Atom   │
│  <input> │                     │  .value   │
│          │  ◀───────────────── │          │
└──────────┘    effect (Atom→DOM) └──────────┘
```

The binding maintains closure references internally, but utilizes a strict teardown sequence during cleanup (`binding = null`) to proactively release objects for V8's garbage collector.

### Features

- **IME Support**: `compositionstart`/`compositionend` events gate sync to prevent partial character commits. External atom updates are ignored while `Composing` bit is set to preserve terminal IME windows.
- **Debounce**: Optional delay before DOM→Atom sync, with atomic flush on blur to prevent data loss.
- **Focus Awareness**: Preserves cursor position when atom updates while input is focused. Uses `isDomUpToDate` to check functional equality (via `parse`) to avoid overwriting user typing (e.g. "1.0" vs atom 1).
- **Cycle Prevention**: `BindingFlags` bitfield prevents sync loops (SyncingToAtom/SyncingToDom) and tracks Focus/IME state.
- **Parse/Format**: Custom transform functions for type coercion (e.g., string ↔ number).

## 5. List Reconciliation

`atomList` (`bindings/list/`) renders reactive arrays using a high-performance **3-pass reconciliation** algorithm:

1. **Prefix Trimming**: Identifies and skips common items at the start of the list.
2. **Suffix Trimming**: Identifies and skips common items at the end of the list.
3. **Middle Diffing**: Reconciles the middle range that has changed.
   - Uses **Bitwise ItemState Flags** (`New`, `Existing`, `ForceReplace`, `Unchanged`) to track the lifecycle of each item in the new list.
   - Employs a **Key Mapping** strategy for O(1) item lookup during diffing.
4. **Patching**: Synchronizes the DOM using a **greedy placement strategy** during a reverse traversal. It uses **pure DOM APIs** (`target.insertBefore`, `target.appendChild`) to bypass jQuery's internal overhead, ensuring O(N) performance for large datasets.
5. **Fast Initial Render**: When possible (string output, no complex bindings), it uses `innerHTML` with bulk-sanitized fragments for the first render to maximize hydration speed.

### 5.1 Reconciliation Lifecycle

The reconciliation process is modularized into dedicated units:

- **`diff.ts`**: Calculates the difference between the old and new state, yielding a `PreparedDiff`.
- **`dom.ts`**: Handles physical DOM manipulations and lifecycle callback execution based on the diff.
- **`context.ts`**: Manages the state and asynchronous cleanup of the container.

### Lifecycle Hooks

- `render(item)`: Creates the initial DOM element.
- `bind($el, item)`: Attaches reactive bindings (runs once per element).
- `update($el, item)`: Updates existing elements (optimization to avoid rebinding).
- `onAdd($el)`: Called after insertion (for entry animations).
- `onRemove($el)`: Called before removal (supports async exit animations via Promise).

### Delegated Event Listeners (`events`)

`events` attaches one listener per event type on the **container**, not on each item. This keeps memory usage constant regardless of list size.

```text
events: { 'click .del': handler }
  → $container.on('click', delegateHandler)     // 1 listener total

delegateHandler(e):
  walk e.target → childElement chain
    → dataset.atomKey (DOM lookup)              // O(1) key extraction
    → keyToIndex.get(key)                       // O(1) index lookup
    → handler(item, index, e)
```

The `keyToIndex` map is kept in sync at the end of every effect run and cleared via `registry.trackCleanup` on container teardown.

## 6. Component Mounting

`atomMount` (`mount.ts`) provides a simple component lifecycle:

```javascript
$el.atomMount((el, props) => {
  // Setup: create bindings, effects, listeners
  return () => {
    // Cleanup: called on unmount
  };
});
```

- **Automatic Cleanup**: Before mounting, it automatically calls `registry.cleanupTree(el)` to dispose of any existing component and its reactive bindings.
- **Batched Execution**: The component function is executed within `batch()` and `untracked()`. This ensures that initial state setups are atomic (preventing intermediate DOM flushes) and that setup logic doesn't leak into parent reactive effects.
- **Idempotency**: Double-unmount protection via `WeakMap.delete()` atomic guard.
- **Error Isolation**: Cleanup errors and mounting errors are caught and logged as `[atom-mount]` without interrupting the rest of the application.

## 7. SPA Router

The router is entirely **reactive**. Navigation (`navigate()` or URL change) updates the `currentRoute` and `queryParams` atoms.

### 7.1 Mode Abstraction (`UrlAdapter`)

The router decouples browser navigation from the core logic using a **Strategy Pattern** (`UrlAdapter`). This isolates mode-specific logic (History API vs. location.hash) into specialized adapters:

- `getBrowserState()`: Fetches normalized path and parsed query params.
- `commit(path)`: Persists new state to the URL.
- `revert(url)`: Restores previous URL on guard rejection.
- `resolveAnchor(el)`: Extracts logical path from standard `<a>` elements.

### 7.2 Matching Engine (`RouteMatcher`)

Route registration pre-compiles paths into specialized lookups:

1. **Exact Match (O(1))**: Static paths are stored in a `Map` for instant resolution.
2. **Dynamic Match (Regex)**: Paths with `:param` segments are compiled into Regular Expressions with captured groups.
3. **Implicit Auto-Discovery**: If no routes are provided, the router scans for `<template data-path="..." title="...">` elements.

### 7.3 Transition Lifecycle

Every navigation follows a strict reactive pipeline:

1. **Link Interception / Programmatic Call**: Normalizes the target path.
2. **Leave Guards**: Executes `onLeave` for the current route.
3. **Browser Sync**: `UrlAdapter` updates the browser URL (or reverts if blocked).
4. **Enter Guards**: Executes `onEnter`. Returning `false` triggers a URL restoration.
5. **Reactive State Update**: `currentRoute` and `queryParams` atoms are updated.
6. **DOM Render Effect**: Clears container, clones template or calls `render()`, and manages `onMount`.
7. **Accessibility Finalization**: Synchronizes `document.title` and shifts focus to the new content's primary heading (`<h1>`).

### 7.4 Performance & Resilience

- **Link Resolution Cache**: A `WeakMap` caches resolved route names for `<a>` and `[data-route]` elements, skipping repetitive URL parsing.
- **Stateless PathUtils**: All string manipulation (normalization, splitting) is centralized in a pure utility object.
- **Asset Links**: The interception engine identifies and ignores links to files (containing dots) to prevent interference with standard downloads or external assets.

### 7.5 Mode Abstraction Logic

| Function | Hash mode | History mode |
| --- | --- | --- |
| `getRouteName()` | Parses `location.hash` | Extracts from `pathname` after `basePath` (exact match or slash-delimited) |
| `getQueryParams()` | Parses `?` in hash string | Parses `location.search` |
| `setUrl(route)` | Sets `location.hash` | Calls `history.pushState()` |
| `restoreUrl()` | Reverts `location.hash` | Calls `history.replaceState()` (prevents history stack loops) |
| `getCurrentUrl()` | Returns `location.hash` | Returns `pathname + search` |

### Key Design Decisions

- **Reactive**: `currentRoute` is a `ReadonlyAtom` — external code reads it reactively but must use `navigate()` to change routes, keeping the URL in sync.
- **Navigation Guards**: `onLeave` hooks can return `false` to block navigation. URL is restored on block (hash revert or `replaceState`).
- **Event Delegation**: `autoBindLinks` uses `$(document).on('click', '[data-route]')` for dynamically added links.
- **Active State**: Active-link class management uses a reactive `effect` that re-runs whenever `currentRoute` changes, updating all `[data-route]` links in a single pass using **manual loops** for performance.
- **Backwards Compatible**: Default mode is `'hash'`, preserving existing behavior.

### 7.6 Nav & Router Synergy (Traffic Control)

The library provides a specialized "Traffic Control" strategy to allow `$.atomNav` (top-level PJAX) and `$.route` (nested SPA routing) to coexist in the same application without conflict:

- **Selector isolation**: `$.atomNav` intercepts links based on a specific selector (defaulting to `a[data-nav]`). By keeping layout links as `data-nav` and sub-view links as `data-route`, the two systems never fight over the same click event.
- **Base Path isolation**: The Router's `basePath` ensures that it only responds to URLs within its domain. If a link points outside the `basePath`, the router naturally ignores it, allowing the standard browser behavior or `$.atomNav` to take over.
- **Nested Teardown**: Because `$.route` tracks its target element in the `registry`, it is automatically destroyed when `$.atomNav` replaces its parent container. This ensures that route effects and listeners are cleaned up exactly when the layout that contains them is swapped out.

## 8. Reactive Data Fetching (`$.atomFetch`)

`$.atomFetch` (`fetch.ts`) is a high-level primitive that integrates jQuery's `$.ajax` with `@but212/atom-effect` core's async `computed` atoms.

### 8.1 Lifecycle & Abort Logic

To prevent memory leaks and "zombie" resolutions (where a request resolves but its reactive node was already disposed or superseded), `$.atomFetch` implements a strict lifecycle:

- **AbortController**: Each execution creates a new `AbortController`. The signal is linked to the `jqXHR` object via its `.abort()` method.
- **Auto-Cleanup**: Event listeners on the `AbortSignal` are explicitly removed in a `finally` block to prevent leaks.
- **Disposal**: The returned atom's `.dispose()` method is extended to automatically trigger the `FetchContext.abort()` method, ensuring all pending network activity stops immediately when the UI component using the data is unmounted.

### 8.2 Error Handling

`$.atomFetch` provides robust error isolation:

- **Synchronous Catching**: It wraps the `$.ajax` call in a `try/catch` to capture immediate errors (e.g., malformed URL, synchronous exceptions).
- **Network Error Normalization**: Standardizes jQuery's `jqXHR` error objects into standard `Error` instances with attached metadata (e.g., `lastError.jqXHR`).
- **Abort Silence (Zero Flickering)**: `$.atomFetch` does not require manual `if (error.name === 'AbortError')` checks. The core reactive engine (Signal) enforces a principle where any result—success or failure—from a superseded async execution is discarded. Consequently, `AbortError` from cancelled requests is naturally filtered out, preventing the "Error Flickering" common in traditional `useEffect` patterns during rapid state transitions.

## 9. Security

The binding layer includes defensive measures against XSS and prototype pollution:

- `bindHtml`: Sanitizes content via `sanitizeHtml()`. Switched from a regex-based engine to a **multi-layered DOM-based Sanitizer** using an inert `<template>` fragment and a **TEMPLATE_POOL** for re-entrant efficiency. It employs a **walkAndScrub** strategy that recursively cleans the DOM tree, transforming dangerous tags into inert `<span>` wrappers while preserving safe structure.
- **DOM Clobbering Protection**: Implemented `DOM_BRIDGE` to access element properties (like `.attributes`) and methods (like `.removeAttribute`) directly from the `Element.prototype`. This prevents malicious HTML from "clobbering" these properties and bypassing security checks.
- `bindAttr`: Blocks `on*` event handler attributes (replaces them with `data-unsafe-attr` markers) and dangerous URL protocols using a centralized matcher. This protection covers standard and SVG-specific attributes (`fill`, `filter`, `mask`, etc.) and includes `srcdoc` and `srcset` monitoring.
- `srcdoc` Protection: Specifically monitors `srcdoc` as a high-risk HTML sink, applying tag-based sanitization checks before binding.
- `bindCss`: Blocks CSS values containing `expression()`, `behavior:`, and `url(javascript:)` protocols.
- `bindProp`: Blocks dangerous properties (`innerHTML`, `outerHTML`) and prototype pollution vectors (`__proto__`, `constructor`, `prototype`). It also enforces protocol security on properties mapped to `URL_ATTRS`.
- Centralized Engine: Security patterns and monitoring lists are centralized in `utils/sanitize.ts` and `constants.ts` to ensure consistent enforcement across the entire library.
- **O(n) Fast-path**: `sanitizeHtml` includes an early scan (`needsSanitization`) to bypass expensive DOM parsing for safe strings. The implementation uses a **multi-layered defense** strategy: normalization (entity decoding, control stripping), recursive tag transformation, and protocol/CSS neutralization.

These are **first-pass filters** using optimized regular expressions. For user-generated content, [DOMPurify](https://github.com/cure53/DOMPurify) is recommended. See the [Security Guide](./SECURITY.md) for integration patterns.

## 10. Module Structure

```text
packages/jquery/src/
  index.ts          — Entry point, plugin registration, auto-init
  constants.ts      — Internal constants and log prefixes
  types.ts          — TypeScript global and internal type definitions
  core/
    namespace.ts      — $.atom, $.computed, $.effect, $.nextTick (standardized scheduler-aware tick)
    dom.ts            — Core DOM engine (atomEachElement, createContext, unpack)
    effect-factory.ts — registerReactiveEffect (creates and registers effects)
    registry.ts       — WeakMap-based binding registry + MutationObserver cleanup
    jquery-patch.ts   — jQuery method patches (.on batch, .remove cleanup)
  bindings/
    chainable.ts      — $.fn.atomText, $.fn.atomVal, etc. (jQuery methods)
    unified.ts        — Binding handler implementations + atomBind
    input-binding.ts  — Two-way input binding with IME/debounce/cursor support
    form.ts           — Fully automated form binding with lens-based deep paths
    list/             — Modularized atomList implementation
      index.ts        — Main entry point and effect registration
      diff.ts         — Keyed diffing algorithm with prefix/suffix trimming
      dom.ts          — DOM manipulation, rendering, and empty state handling
      context.ts      — ListContext for managing state and async removals
      types.ts        — Internal types and interface definitions
    mount.ts          — atomMount / atomUnmount component lifecycle
  features/
    route.ts          — SPA router (hash + history mode) with reactive state
    fetch.ts          — $.atomFetch declarative AJAX primitive
    nav.ts            — $.atomNav PJAX navigation module
  internal/
    pool.ts           — Centralized Object/Array pools for low-latency memory reuse
  utils/
    index.ts          — DOM selectors, type classification, and identity helpers
    debug.ts          — Debug mode logging and visual highlighting
    sanitize.ts       — Regex-based HTML sanitization and URL protocol security
    array-pool.ts     — LIFO array pooling utility
    object-pool.ts    — Monomorphic object pooling utility
```

## 11. PJAX Navigation (`$.atomNav`)

`$.atomNav` (`features/nav.ts`) is a state-driven PJAX (Partial Page Loading) module that treats the browser's URL as a reactive atom.

### 11.1 Single Source of Truth

Unlike traditional PJAX libraries that rely on sequential event handlers, `$.atomNav` is driven by a `currentUrl` atom.

- Link clicks and `popstate` events update the `currentUrl`.
- A reactive `$.atomFetch` observes `currentUrl` and handles the network request.
- A reactive `effect` observes the fetch result and reconciles the DOM.

### 11.2 Memory & Race Condition Safety

- **Automatic Unbinding**: To prevent memory leaks and state "shadowing", `$.atomNav` automatically calls `.atomUnbind()` on the target container's children before injecting new HTML.
- **Metadata Synchronization**: It automatically synchronizes `<title>`, and meta tags (`description`, `keywords`, `canonical`) from the response.
- **Attribute Synchronization**: Container attributes (excluding `id`) are synchronized with the incoming fragment's attributes.
- **Abort Protection**: Each navigation life-cycle is managed by an `AbortController`. Programmatic navigations and `popstate` events trigger a new signal, automatically cancelling stale requests and pending hooks.
- **Redirect Support**: Respects `X-PJAX-URL` headers for server-side redirects, updating the browser history and reactive state accordingly.

### 11.3 Lifecycle Hooks

- `onBeforeLoad`: Allows intercepting navigation (e.g., for per-page authentication or unsaved changes warnings).
- `onMount`: Called after new content is injected and bound. Useful for triggering entry animations.
- `onUnmount`: Called before content is replaced. Useful for exit animations.

## 12. Performance & Memory Management

### 12.1 Object & Array Pooling

To minimize Garbage Collection (GC) pressure in highly dynamic applications (e.g., large lists, frequent component mounting), the library implements structured pooling for short-lived objects and arrays.

#### 12.1.1 `ObjectPool<T>`

The `ObjectPool` utility (`utils/object-pool.ts`) manages a stack of reusable plain objects.

- **Monomorphic Shape**: The pool factory ensures all created objects share the same "hidden class" in V8.
- **LIFO Strategy**: Uses a Last-In-First-Out (stack) approach to improve CPU cache locality.
- **Strict Reset**: Every object/array is passed through a `reset` callback before being returned to the pool to prevent stale data leaks.
- **Mandatory Clear on Overflow**: Resources are reset even if the pool reached its `limit` to break element references immediately and assist the Garbage Collector.
- **Double-Release Protection**: Implements `indexOf` checks during `release()` cycles to prevent the same instance from being stored twice, which would otherwise lead to catastrophic shared state corruption.

#### 12.1.2 Reused Structures

1. **`BindingRecord`**: Created per bound element. Pooling these avoids thousands of micro-allocations during hydration. Its `reset` logic orchestrates the cleanup of nested arrays.
2. **`ArrayPool`**: Reuses arrays for `effects` and `cleanups` within a `BindingRecord`. Its `limit` (128) is synchronized with the record pool for maximum reuse.

### 12.2 Dense Monomorphic Strategy

All internal state records (e.g., `BindingRecord`, `InputBinding`) are initialized with a fixed, dense set of fields from the constructor. By strictly avoiding "shape transitions" (dynamically adding or deleting properties), the objects remain **Monomorphic**. This allows V8 to utilize **Inline Caches (IC)** at every property access point, achieving near-native performance for reactive propagation and DOM updates.

### 12.3 Efficient Reconciliation

By moving from binary buffers and manual pooling to a simplified 3-pass algorithm, `atomList` leverages modern JS engine optimizations (V8's Map and Array optimizations) for reconciliation. This reduces architectural complexity while maintaining high performance.

- **Sanitization Fast-path**: `sanitizeHtml` includes an early scan (`needsSanitization`) to bypass expensive DOM parsing for safe strings. The implementation uses a **multi-layered defense** strategy: normalization (entity decoding, control stripping), recursive tag transformation to inert `<span>` elements, and protocol/CSS neutralization.
- **Robust Equality**: `shallowEqual` uses `Object.keys()` and `Object.is()` for reliable comparison, correctly handling `NaN` and edge cases while maintaining an efficient linear scan.

## 13. CPU Branch Prediction Optimizations

To achieve zero-overhead reactive updates, the library implements several techniques to maximize **Pipeline Efficiency** by reducing branch mispredictions in the hot-path.

### 13.1 Monomorphic Singleton Swap

Instead of checking `if (debug.enabled)` in the hot paths and relying on complex dynamic method replacement, the debugging subsystem utilizes a **Monomorphic Singleton Swap** pattern (identical to the Core package).

- In production (or when disabled during initialization), the exported `debug` singleton is a `ProdDebugController` composed entirely of empty No-op functions (`() => {}`). V8 aggressively inlines these empty functions, eliminating the call overhead entirely.
- When development mode is active (or enabled explicitly via `sessionStorage.setItem('__ATOM_DEBUG__', 'true')`), the fully instrumented `DevDebugController` is exported instead.

This eliminates thousands of conditional branches from the execution pipeline, keeping the CPU's Branch Target Buffer (BTB) clear for business logic while ensuring zero cost for shipping debug instrumentation to production.

### 13.2 Bitmask Dispatch (`atomBind`)

The sequential 12-way `if` chain in `atomBind` was replaced with a **Bitmask Dispatch table**.

1. `atomBind` converts current options into a single 32-bit integer mask.
2. The loop uses bitwise operations (`m & -m`) to isolate the next binding bit.
3. The bit index is calculated using `31 - Math.clz32(bit)`, which V8 compiles to a single `BSR` (Bit Scan Reverse) instruction.
4. The corresponding handler is looked up in the monomorphic `BIND_HANDLERS` table, achieving O(1) jump table dispatching. Tuple arguments (e.g. `[source, formatter]`) are efficiently unpacked using a shared `unpack` utility which recognizes valid options/formatters via property-checking on the second element.

### 13.3 Strategy Specialization (`InputBinding`)

Two-way input bindings often branch based on element type (Text vs. Select-Multiple) and focus state. These branches were eliminated by:

- **Monomorphic `initStrategies`**: Pre-specializing `readDom`, `writeDom`, `equal`, and `format` functions in the constructor.
- **Consolidated `isDomUpToDate`**: Encapsulates functional equality checks (including `parse`-based checks while focused) into a single, predictable path.
- **Bitmask Guards**: Uses the `Busy` mask (Composing | SyncingToAtom | SyncingToDom) for constant-time synchronization gates.

This ensures the updater function's control flow remains identical for a given element type, allowing the CPU to perfectly predict the execution path.

### 13.4 Static Snapshot for Registry Cleanup

Live DOM collections (e.g. `HTMLCollection`) change their length as elements are removed, which causes "unstable loop prediction". `cleanupDescendants` now converts the result to a **static array snapshot**. This stabilizes the loop's iteration count and branch targets, preventing stalls during large DOM teardowns.

### 13.5 Fast-path Sanitization Scan

`sanitizeHtml` performs an O(n) scan for safe characters (`<`, `&`, controls) and attribute prefixes before running the DOM engine. For the vast majority of "safe" updates (numbers, plain text), this skips the computationally expensive and branch-heavy logic entirely.

## 14. Lenses & Structural Sharing

`$.atomLens` and related utilities are now **re-exported from the Core package**. The jQuery layer provides these via the `$` namespace while delegating the recursive structural sharing logic to the core engine.

### 14.1 Integration with `atomForm`

`atomForm` (`bindings/form.ts`) leverages core's `setDeepValue` and `getPathValue` utilities for O(1) performance on large forms, managed by the `FormBinder` orchestrator.

1. Field-Level Atoms (Leaf Atoms): Instead of binding each input directly to a lens of the root atom (which would create N effects subscribing to the root), `atomForm` creates individual "leaf atoms" for each field.
2. Centralized Root Dispatcher: A single `effect` watches the root atom and dispatches updates only to relevant leaf atoms using a batch cycle. This eliminates the O(N) re-evaluation overhead.
3. Local Sync & Circular Protection: Each field entry has its own effect to sync local changes (including debouncing and transforms) back to the root atom. The `FormBinder` uses an `isSyncingFromLeaf` flag to explicitly break circular update loops between the root and leaf states.
4. Dynamic Lifecycle & Ref-Counting:
   - A `MutationObserver` monitors child additions, removals, and attribute changes (`name`).
   - **Ref-counting**: Multiple radio/checkbox inputs with the same `name` share a single `FieldEntry` (atom + effect). The entry is only disposed when all associated elements are removed.
   - **Renaming**: When an element's `name` changes, the binder automatically releases the old field and acquires the new one.
5. Recursive Path Support: Supports nested property access and array indexing (e.g., `user.profile.name`, `items[0].text`) by normalizing name attributes into standard dot-notation paths.
6. Toggle Groups: Radio and Checkbox groups are handled via a specialized `bindToggle` strategy that manages array-based values for multi-check boxes and string/boolean states for radio and single checks.

## 15. Debugging & Visual Highlighting

The `DebugController` (`utils/debug.ts`) provides visual feedback for DOM updates when enabled.

### 15.1 Visual Highlighting

To provide immediate visual feedback during reactive updates, the controller applies a temporary outline highlight to the target element.

- **Non-blocking Rendering**: Highlights are applied using `requestAnimationFrame` to ensure they don't block the reactive update cycle.
- **Robustness**: Uses a `WeakMap` for `rafs` and `timers` to track active animations per element. This prevents overlapping highlights from leaking and ensures that existing timers are cancelled if a new change occurs.
- **Highlight Persistence**: The cleanup logic explicitly removes the highlight class even if an element is disconnected from the DOM before the timeout, preventing accidental persistence.
- **Smooth Fade-out**: To fix abrupt transitions when the highlight class is removed, the CSS `transition` is attached to a persistent attribute selector (`[data-atom-debug]`). The highlight class itself is purely additive, enabling a graceful exit transition handled by the browser's CSS engine.
- **Dynamic Style Injection**: Injects necessary CSS exactly once into the document head, with checks for existing style markers to avoid duplication.

### 15.2 Selector Logic (`getSelector`)

The `getSelector` utility in `utils/index.ts` generates human-readable identifier strings for elements in logs:

- **Format**: Returns `tag#id.class1.class2.type` for maximum context during debugging.
- **SVG Support**: Explicitly uses `getAttribute('class')` to handle SVG elements, where `.className` returns an `SVGAnimatedString` object instead of a string.
