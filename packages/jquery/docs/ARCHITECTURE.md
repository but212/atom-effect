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
    → unified.ts: bindText(el, atom)
      → effect-factory.ts: registerReactiveEffect(el, source, updater)
        → core: effect(() => { updater(source.value) })
        → registry.trackEffect(el, effectInstance)
```

### 2.1 Effect Factory

`registerReactiveEffect` and `registerMapEffect` (`effect-factory.ts`) utilize a shared `createAsyncRunner` utility to manage reactive updates. This internal helper encapsulates:

- **Async Resolution**: Automatically handles `Promise` values from any source.
- **Race Condition Protection**: Uses a monotonic `latestId` to ensure only the result of the most recent async operation is applied to the DOM.
- **Zombie Prevention**: Automatically tracks disposal state via `registry.trackCleanup`, ensuring stale async results are discarded if the element is disconnected during resolution.
- **Monomorphic Updates**: The runner ensures that updaters are consistently executed inside an `untracked` block to isolate reactive dependencies.

This eliminates boilerplate across all binding types and ensures robust, memory-safe async behavior.

### 2.2 DOM Engine

`atomEachElement(jq, fn)` in `core/dom.ts` provides the base engine for all reactive bindings. The central iterator used by all chainable methods, it handles jQuery sets, filters for `HTMLElement` (skipping text/comment nodes), and provides optimized loops to minimize property lookups in hot paths.

Internal binding handlers in `unified.ts` generally operate on native `HTMLElement` references to maximize performance, utilizing jQuery only when complex event delegation or multi-event management is required (e.g., in `bindEvents`).

### 2.3 Unified Binding (`atomBind`)

`atomBind` dispatches to focused handler functions:

```text
atomBind({ text, html, class, css, attr, prop, show, hide, val, checked, on })
  → bindText, bindHtml, bindClass, bindCss, bindAttr, bindProp,
    bindVisibility, bindVal, bindChecked, bindEvents
```

Each handler is a standalone function that receives the element and the reactive value. This decomposition keeps cyclomatic complexity low and enables tree-shaking.

#### 2.3.1 Performance Optimizations in Bindings

To achieve maximum performance during high-frequency updates (e.g., animations or rapid state changes), `unified.ts` implements several optimizations:

- **Metadata Caching**: Complex bindings like `atomClass`, `atomCss`, `atomAttr`, and `atomProp` pre-calculate metadata (e.g., camelCase property names, ARIA flags, URL-bearing status) during the initial registration. Map objects for these bindings are **hoisted outside the element iteration loop** to avoid redundant object allocations.
- **Monomorphic Dispatch**: The internal `InputBinding` class specializes its `format` and `equal` logic at construction time. This removes branching and `instanceof` checks from the high-frequency `syncToDom` and `syncToAtom` paths.
- **JS-Level Value Caching**: `bindHtml`, `bindClass`, `bindCss`, `bindProp`, and `bindAttr` maintain a local JS-side cache of the last written value. This avoids expensive DOM reads (like `el.innerHTML`) and redundant DOM writes (like `classList.add` or property assignments) when the reactive state hasn't meaningfully changed.
- **Batched Map Updates**: `registerMapEffect` processes entire dictionaries of reactive values in a single effect, reducing the number of total `Effect` objects and improving subscription efficiency.
- **Async Consolidation**: `registerMapEffect` uses `Promise.all` to synchronize multiple asynchronous dependencies within a map, ensuring the updater is called only when all new values have resolved. This prevents partial updates and flickering in complex bindings.

## 3. Lifecycle Management

### 3.1 Binding Registry

The `BindingRegistry` (`registry.ts`) is the central lifecycle manager. It tracks:

- **Effects**: Core `effect` instances bound to DOM elements.
- **Cleanups**: Component-level cleanup functions.

Storage uses **WeakMap/WeakSet** to prevent memory leaks. The `BindingRecord` objects are plain structures used to track resources per element, which are proactively cleaned up when the element is removed. Resource pooling has been removed to reduce architectural complexity, as modern JS engines handle the allocation of these small objects with extremely high efficiency (O(1) memory management).

### 3.2 Marker Class Optimization

Bound elements receive a `_aes-bound` CSS class marker. This enables O(M) cleanup via `querySelectorAll('._aes-bound')` where M is the number of bound elements, instead of O(N) traversal of all descendants. `querySelectorAll` provides a **static NodeList snapshot**, which stabilizes the teardown loop against concurrent DOM removals and avoids the "unstable length" issues inherent in live collections like `HTMLCollection`. This approach is significantly faster than recursive tree traversal as it leverages the browser's internal selector engine.

### 3.3 Auto-Cleanup via MutationObserver

`enableAutoCleanup(root)` installs a `MutationObserver` on the specified `root` (Element, ShadowRoot, or DocumentFragment) that watches for removed nodes. For the global DOM, this is lazily initialized via `ensureAutoCleanup()` upon registering the very first reactive binding. The logic is robust against early initialization; it performs a safety check for `document.body` and gracefully recovers if the binding occurs before the body is ready. Multiple roots can be observed concurrently (e.g., for micro-frontends).

#### 3.3.1 Move Robustness (Deferred Cleanup)

To support synchronous DOM moves (e.g., `parent2.appendChild(el)`), the library implements **Deferred Cleanup** via `registry.deferredCleanup(node)`.

- When an element is disconnected, it is marked as "ignored" and a cleanup task is queued as a **microtask**.
- If the element is re-connected before the microtask runs, the cleanup is cancelled.
- This ensures that reactive state (atoms, effects) is preserved during common jQuery operations like repositioning elements.

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

The global `MutationObserver` (on `document.body`) does not cross Shadow DOM boundaries. However, AEJ provides enhanced Shadow DOM support through the `BindingRegistry`:

- **Host Marking**: When a component is initialized (via `useAtomComponent`), its host is marked with an `_aes-has-shadow` class.
- **Efficient Traversal**: `cleanupTree` and `cleanupDescendants` use this marker to jump directly to shadow hosts, avoiding O(N) full-tree scans while ensuring all shadow subtrees are cleaned.
- **Closed Shadow Support**: The registry maintains a `WeakMap` of host elements to their `ShadowRoot` objects, allowing AEJ to clean up "closed" mode shadows that are otherwise inaccessible.
- **Scoped Observers**: `useAtomComponent` automatically attaches a `MutationObserver` to the component's root (Host or ShadowRoot). These observers are explicitly disconnected during `teardown()` to prevent memory leaks (releasing the Map's strong reference to the ShadowRoot).

### 3.5 jQuery Method Patches

`enablejQueryOverrides()` (`jquery-patch.ts`) patches core jQuery methods:

| Method | Patch Behavior |
| ------ | -------------- |
| `.remove()` | Calls `cleanupTree` + marks as ignored before original removal |
| `.empty()` | Calls `cleanupDescendants` before original empty |
| `.detach()` | Marks elements as "kept" (preserves bindings for re-attach) |
| `.on()` | Wraps handlers in `batch()` for automatic update coalescing. Supports maps and `.one()`. |
| `.off()` | Resolves wrapped handlers via WeakMap for correct unbinding |

The `.on()` and `.one()` patches use `INTERNAL_HANDLER` (a `Symbol.for('atom-effect-internal')`) to mark wrapped handlers, ensuring compatibility across different library instances or bundles.

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

- **Strategy Specialization**: Uses `createStrategies` to select optimized `read`/`write`/`equal`/`format` logic at initialization. This avoids constant branching by assigning specialized functional strategies based on element type (e.g., standard inputs vs. `select[multiple]`).
- **Cursor Preservation**: Focused text controls use a selection-range buffer during writes to prevent "jumping" when the atom value is updated externally.
- **Cycle Prevention**: A bitmask-based state gate (`Busy`, `SyncingToAtom`, `SyncingToDom`) ensures that state synchronization remains uni-directional at any given moment, preventing infinite loops.
- **IME & Composition**: Gathers character entries during composition using `compositionstart`/`compositionend` events, deferring atom updates until strings are finalized.

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

Route registration pre-compiles paths into specialized lookups. Registration is handled in a single pass, with exact matches and dynamic paths (containing `:param` segments) stored in a unified `routes` array. This ensures predictable matching priority and simplifies the internal matching loop.

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
| `getBrowserState()` | Parses `location.hash` and splits query string. | Extracts path from `pathname` relative to `basePath` and parses `location.search`. |
| `commit(path)` | Sets `location.hash` with optional query prefix. | Calls `history.pushState()` with the absolute path. |
| `revert(url)` | Restores previous `location.hash`. | Calls `history.replaceState()` to restore the previous URL without adding to history. |
| `resolveAnchor(el)` | Extracts logical path from `hash`. | Normalizes `pathname` and `search` relative to the app base. |
| `setupListener(h)` | Listens for `hashchange`. | Listens for `popstate`. |

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

- **AbortController**: Each execution creates a new `AbortController`. The internal `cleanup` function links the signal to the `jqXHR.abort()` method.
- **Auto-Cleanup**: Listeners on the `AbortSignal` are explicitly removed in a `finally` block.
- **Disposal**: The atom's `.dispose()` method is patched to trigger an immediate abort, ensuring all pending network activity stops when the atom is destroyed.

### 8.2 Error Handling

`$.atomFetch` provides robust error isolation:

- **Data Normalization**: Uses internal `toSettings` and `toError` helpers to ensure consistent behavior across different network conditions and jQuery versions.
- **Network Error Normalization**: Standardizes `jqXHR` objects into standard `Error` instances, with specialized handling for `status 0` (timeouts/network failures).
- **Hook Isolation**: The `onError` user hook is wrapped in a dedicated `try/catch` block. Exceptions thrown within the hook are logged to the console but do not re-throw, preventing user-defined logic from breaking the internal reactive update cycle.
- **Abort Silence (Zero Flickering)**: Cancellations (via `AbortError`) are caught internally and re-thrown as a named error that the core reactive engine understands but ignores for state updates, preventing "Error Flickering" during rapid re-evaluations.

## 9. Security

The binding layer includes defensive measures against XSS and prototype pollution:

- `bindHtml`: Sanitizes content via `sanitizeHtml()`. It uses a **multi-layered DOM-based Sanitizer** that employs a **walkAndScrub** strategy. It recursively cleans the DOM tree, transforming dangerous tags into inert `<span>` wrappers while preserving safe structure.
- **DOM Clobbering Protection**: All element interactions are routed through `DOM_PROTOTYPE_BRIDGE`, which accesses properties and methods directly from `Element.prototype` and `Node.prototype` via descriptors. This prevents malicious HTML from "clobbering" instance properties to bypass security checks.
- `bindAttr`: Blocks `on*` event handler attributes (collects them into a comma-separated `data-unsafe-attr` list) and dangerous URL protocols using a centralized matcher. This protection covers standard and SVG-specific attributes and includes individual URL monitoring for `srcset`. It also strips all whitespace and decodes entities BEFORE protocol matching.
- `srcdoc` Protection: Specifically monitors `srcdoc` as a high-risk HTML sink, applying recursive sanitization checks via `REGEX_DANGEROUS_SNIFFER`.
- `bindCss`: Blocks CSS values containing dangerous patterns. It strips CSS comments (`/* ... */`) before validation to prevent obfuscation bypasses and matches against an array of known threat patterns (`CSS_DANGER_PATTERNS`).
- `bindProp`: Blocks dangerous properties (`innerHTML`, `outerHTML`) and prototype pollution vectors (`__proto__`, `constructor`, `prototype`).
- **Sanitization Engine**: `sanitizeHtml` implementation uses a **Dumb Code, Smart Data** strategy: normalization (entity decoding with optional semicolon support), recursive tag transformation, and data-driven attribute/CSS neutralization.

These are **first-pass filters** using optimized regular expressions. For user-generated content, [DOMPurify](https://github.com/cure53/DOMPurify) is recommended. See the [Security Guide](./SECURITY.md) for integration patterns.

## 10. Module Structure

```text
packages/jquery/src/
  index.ts          — Entry point, plugin registration, auto-init
  constants.ts      — Internal constants and log prefixes
  types.ts          — TypeScript global and internal type definitions
  core/
    namespace.ts      — $.atom, $.computed, $.effect, $.nextTick (standardized scheduler-aware tick)
    dom.ts            — Core DOM engine (atomEachElement, unpack)
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
  utils/
    index.ts          — DOM selectors, type classification, and identity helpers
    debug.ts          — Debug mode logging and visual highlighting
    sanitize.ts       — Regex-based HTML sanitization and URL protocol security
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
- **Phase Transitions**: Navigation is broken down into fast-paths. External origins hand off to the browser. Navigating to the exact same location is ignored to prevent hook freezes. Hash-only transitions bypass AJAX hooks entirely for immediate performance.
- **Redirect Support**: Respects `X-PJAX-URL` headers for server-side redirects, updating the browser history and reactive state accordingly.

### 11.3 Lifecycle Hooks

- `onBeforeLoad`: Allows intercepting navigation (e.g., for per-page authentication or unsaved changes warnings).
- `onMount`: Called after new content is injected and bound. Useful for triggering entry animations.
- `onUnmount`: Called before content is replaced. Useful for exit animations.

## 12. Performance & Memory Management

### 12.1 Internal Data Structures

All internal state records (e.g., `BindingRecord`, `InputBinding`) are initialized with a fixed, dense set of fields from the constructor. By strictly avoiding "shape transitions" (dynamically adding or deleting properties), the objects remain **Monomorphic**. This allows V8 to utilize **Inline Caches (IC)** at every property access point, achieving near-native performance for reactive propagation and DOM updates.

### 12.3 Efficient Reconciliation

By moving from binary buffers and manual pooling to a simplified 3-pass algorithm, `atomList` leverages modern JS engine optimizations (V8's Map and Array optimizations) for reconciliation. This reduces architectural complexity while maintaining high performance.

- **Sanitization Engine**: `sanitizeHtml` implementation uses a data-driven strategy: normalization (entity decoding, control stripping), recursive tag transformation to inert `<span>` elements, and protocol/CSS neutralization.
- **Robust Equality**: `shallowEqual` uses `Object.keys()` and `Object.is()` for reliable comparison, correctly handling `NaN` and edge cases while maintaining an efficient linear scan.

## 13. CPU Branch Prediction Optimizations

To achieve zero-overhead reactive updates, the library implements several techniques to maximize **Pipeline Efficiency** by reducing branch mispredictions in the hot-path.

### 13.1 Zero-Overhead Debugging

The library implements a simplified debugging subsystem that minimizes overhead when disabled.

- In production (or when `debug.enabled` is false), the `domUpdated` method returns immediately.
- The `resolveInitialState` utility determines the default state based on `window.__ATOM_DEBUG__` or `NODE_ENV`.

### 13.2 Task-Based Dispatch (`atomBind`)

The implementation of `atomBind` optimizes multi-binding dispatch through a **Task-Based Loop**:

1. `atomBind` identifies active binding keys from the input options.
2. It constructs a **monomorphic array of `BindingTask` objects** specifically for the current call.
3. During element iteration, it iterates through this pre-filtered task list, calling the specific handler (`run`) for each active binding.
4. This approach minimizes branching inside the element loop and avoids the overhead of checking inactive keys for every single element in a jQuery set. The loop iterates through the static `BINDING_TASKS` collection, performing a single `undefined` check per task. Unified property resolution (supporting both single values and maps) is handled by the centralized `resolveMap` utility in `chainable.ts`.

### 13.3 Strategy Specialization (`InputBinding`)

Two-way input bindings often branch based on element type (Text vs. Select-Multiple). These branches were eliminated by:

- **Monomorphic Strategies**: Pre-specializing `read`, `write`, `equal`, and `format` functions in the constructor via `createStrategies`.
- **Functional Equality**: Encapsulates functional equality checks directly into the specialized `equal` strategy, providing a single, predictable execution path.
- **Bitmask Guards**: Uses the `Busy` mask (Composing | SyncingToAtom | SyncingToDom) for constant-time synchronization gates.

This ensures the updater function's control flow remains identical for a given element type, allowing the CPU to perfectly predict the execution path.

### 13.4 Static Snapshot for Registry Cleanup

Live DOM collections (e.g. `HTMLCollection`) change their length as elements are removed, which causes "unstable loop prediction". `cleanupDescendants` now converts the result to a **static array snapshot**. This stabilizes the loop's iteration count and branch targets, preventing stalls during large DOM teardowns.

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
- **SVG Support**: Handles SVG elements where `.className` returns an `SVGAnimatedString` object by accessing its `.baseVal`.

## 16. Web Component & DI Integration

`features/web-component.ts` implements a composition-based model for modern Web Components.

### 16.1 Composition via `useAtomComponent`

Instead of forced inheritance, AEJ uses a controller pattern:

```typescript
private aej = $.useAtomComponent(this);
```

This controller manages:

- **Scoped API**: Provides a raw `host` reference, an active `root` node, and a scoped jQuery instance (`$`) restricted to the component boundary.
- **Lifecycle Sync**: Bridges `connectedCallback` to `setup()` and `disconnectedCallback` to `teardown()`.
- **Observer Management**: Handles the scoped `MutationObserver` lifecycle for the component's boundary, supporting custom roots (Shadow DOM).

### 16.2 Dependency Injection (DI) Engine

`provideAtom` and `injectAtom` implement a reactive DI system using DOM events.

#### 16.2.1 Composed Tree Traversal

AEJ uses a **stateless tree-walker** for DI resolution. This avoids the overhead and complexity of CustomEvents:

1. **Upward Scan**: `injectAtom` starts from the target's parent and walks up the DOM.
2. **Shadow Navigation**: When it hits a `ShadowRoot`, it jumps to the `host` element and continues.
3. **Registry Lookup**: At each step, it checks the node's `AEJ_STATE` for registered providers.
4. **Resolution**: The first match is returned. This guarantees nearest-ancestor priority and allows for context overrides.

#### 16.2.2 Reactive & Lazy Resolution

- **Reactive**: Injected values are returned as `ReadonlyAtom<T>`. If the provider is an atom, it is returned directly; otherwise, it's wrapped in a computed atom.
- **Late Binding**: For Custom Elements, if the element is disconnected during construction, a lazy computed atom is returned that delays resolution until the first access while connected.

#### 16.2.3 Type Safety (Generics)

The new DI engine favors standard TypeScript generics over interface merging. By providing a type parameter to `injectAtom<T>`, users get full IDE support and compile-time validation for the returned `ReadonlyAtom<T>`.
