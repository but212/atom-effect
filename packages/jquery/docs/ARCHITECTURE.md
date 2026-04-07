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
- **Async Support**: If the value (from atom or static source) is a **Promise**, `registerReactiveEffect` handles the resolution automatically. It includes race condition protection using `latestPromise` tracking to ensure only the most recently assigned promise's result is applied to the DOM.

This eliminates boilerplate across all binding types and ensures robust async behavior.

### 2.2 Binding Context & DOM Engine

`createContext(el)` and `atomEachElement(jq, fn)` in `core/dom.ts` provide the base engine for all reactive bindings:

- **Binding Context**: Provides a shared context object per element, including a `trackCleanup` helper.
- **DOM Engine (`atomEachElement`)**: The central iterator used by all chainable methods. It handles jQuery sets, filters for `HTMLElement` (skipping text/comment nodes), and provides lazy context creation only when required (`needsCtx: true`).
- **Unpack Utility**: A shared utility used by `atomBind` and other integrated bindings to handle `[source, options]` tuple arguments consistently.

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

## 3. Lifecycle Management

### 3.1 Binding Registry

The `BindingRegistry` (`registry.ts`) is the central lifecycle manager. It tracks:

- **Effects**: Core `effect` instances bound to DOM elements.
- **Cleanups**: Arbitrary cleanup functions (event listeners, timers, etc.).

Storage uses **WeakMap/WeakSet** to prevent memory leaks. To reduce GC pressure, the `BindingRecord` objects used to store these resources are acquired from and released to a **LIFO Object Pool**.

### 3.2 Marker Class Optimization

Bound elements receive a `_aes-bound` CSS class marker. This enables O(M) cleanup via `getElementsByClassName('_aes-bound')` where M is the number of bound elements, instead of O(N) traversal of all descendants. This approach is significantly faster than `querySelectorAll` as it avoids the CSS selector parsing engine and returns a live `HTMLCollection`.

### 3.3 Auto-Cleanup via MutationObserver

`enableAutoCleanup(root)` installs a `MutationObserver` on the specified `root` element that watches for removed nodes. For the global DOM, this is lazily initialized via `ensureAutoCleanup()` upon registering the very first reactive binding, ensuring protection even if bindings occur prior to `DOMContentLoaded`. Multiple roots can be observed concurrently (e.g., for micro-frontends).

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

The automatic `MutationObserver` cleanup does not cross Shadow DOM boundaries. If you use Web Components with Shadow Roots, you must manually call `registry.cleanupTree(shadowRoot)` when the component is disconnected to prevent memory leaks in its internal bindings.

### 3.5 jQuery Method Patches

`enablejQueryOverrides()` (`jquery-patch.ts`) patches core jQuery methods:

| Method | Patch Behavior |
| ------ | -------------- |
| `.remove()` | Calls `cleanupTree` + marks as ignored before original removal |
| `.empty()` | Calls `cleanupDescendants` before original empty |
| `.detach()` | Marks elements as "kept" (preserves bindings for re-attach) |
| `.on()` | Wraps handlers in `batch()` for automatic update coalescing |
| `.off()` | Resolves wrapped handlers via WeakMap for correct unbinding |

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

`atomList` (`list.ts`) renders reactive arrays using a high-performance **1D flat buffer reconciliation** algorithm:

1. **Prefix/Suffix Trimming**: Identifies and skips common items at the start and end of the list.
2. **Key Mapping**: Maps remaining items to unique keys for diffing.
3. **Flat Buffer Diffing**: Uses typed arrays (`Uint8Array` for states, `Int32Array` for moves) instead of intermediate objects to track transitions (added, removed, replaced, moved). Items with identical keys but different contents are marked for `update`.
4. **Patching**: Synchronizes the DOM using the calculated transition map with minimal moves and removals. Uses **pure DOM APIs** (`target.insertBefore`, `target.appendChild`) for structural changes during the reconciliation loop to bypass jQuery's internal overhead and achieving O(N) performance for large datasets.
5. **Fast Initial Render**: When possible, it uses `innerHTML` with bulk-sanitized fragments for the first render to maximize hydration speed.

### 5.1 Memory Efficiency (Pooling)

In dynamic lists with high item churn, the library uses centralized pools (`internal/pool.ts`):

- `ObjectPool`: Reuses `Map` and `Set` instances used for indexing during diffing.
- `ArrayPool`: Reuses arrays for keys, items, and DOM nodes returned by the reaper.
- `Buffer Recovery`: Pre-allocated `Uint8Array` and `Int32Array` buffers are grown dynamically and reused across update cycles to eliminate per-update allocations.

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

`$.route()` (`route.ts`) provides SPA routing with reactive state. Supports both **hash** (`location.hash` / `hashchange`) and **history** (`pushState` / `popstate`) modes.

```text
Hash mode:    window.location.hash  ──▶  currentRoute (atom)  ──▶  renderEffect (effect)
History mode: window.location.pathname ──▶  currentRoute (atom)   ──▶  renderRoute()
              window.location.search   ──▶  queryParams (atom)
```

The router is entirely **reactive**. Navigation (`navigate()` or URL change) updates the `currentRoute` and `queryParams` atoms. A single core `effect` (`renderEffect`) observes these atoms and triggers `renderRoute()` when they change.

### Mode Abstraction

The hash/history difference is isolated to 5 internal functions, so all rendering, guard, and link-binding logic is shared:

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

The binding layer includes defensive measures against XSS:

- `bindHtml`: Sanitizes content via `sanitizeHtml()` (removes `<script>`, `on*` events, `javascript:` protocols).
- `bindAttr`: Blocks `on*` event handler attributes and dangerous URL protocols.
- `bindCss`: Blocks CSS values containing `expression()`, `url(javascript:)`, etc.
- `bindProp`: Blocks dangerous properties (`innerHTML`, `outerHTML`), prototype pollution vectors (`__proto__`, `constructor`, `prototype`), `on*` event handlers, and checks mapped URL properties for dangerous protocols.

These are **first-pass filters**. For user-generated content, [DOMPurify](https://github.com/cure53/DOMPurify) is recommended. See the [Security Guide](./SECURITY.md) for integration patterns.

## 10. Module Structure

```text
packages/jquery/src/
  index.ts          — Entry point, plugin registration, auto-init
  constants.ts      — Internal constants and log prefixes
  types.ts          — TypeScript global and internal type definitions
  core/
    namespace.ts      — $.atom, $.computed, $.effect, $.nextTick statics
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
  internal/
    pool.ts           — Centralized Object/Array pools for low-latency memory reuse
  utils/
    index.ts          — DOM selectors, type classification, and identity helpers
    debug.ts          — Debug mode logging and visual highlighting
    sanitize.ts       — Regex-based HTML sanitization and URL protocol security
    array-pool.ts     — LIFO array pooling utility
    object-pool.ts    — Monomorphic object pooling utility
```

## 11. Performance & Memory Management

### 10.1 Object & Array Pooling

To minimize Garbage Collection (GC) pressure in highly dynamic applications (e.g., large lists, frequent component mounting), the library implements structured pooling for short-lived objects and arrays.

#### 10.1.1 `ObjectPool<T>`

The `ObjectPool` utility (`utils/object-pool.ts`) manages a stack of reusable plain objects.

- **Monomorphic Shape**: The pool factory ensures all created objects share the same "hidden class" in V8.
- **LIFO Strategy**: Uses a Last-In-First-Out (stack) approach to improve CPU cache locality.
- **Strict Reset**: Every object is passed through a `reset` callback before being returned to the pool to prevent stale data/reference leaks.

#### 10.1.2 Reused Structures

1. **`BindingRecord`**: Created per bound element. Pooling these avoids thousands of micro-allocations during initial page hydration or route transitions.
2. **Reused Buffers**: Pre-allocated `Uint8Array` and `Int32Array` buffers are grown dynamically and reused across `atomList` update cycles to eliminate per-update allocations.
3. **`ArrayPool`**: Reuses arrays used for `effects` and `cleanups` lists within a `BindingRecord`.

### 10.2 Dense Monomorphic Strategy

All internal state records (e.g., `BindingRecord`, `InputBinding`) are initialized with a fixed, dense set of fields from the constructor. By strictly avoiding "shape transitions" (dynamically adding or deleting properties), the objects remain **Monomorphic**. This allows V8 to utilize **Inline Caches (IC)** at every property access point, achieving near-native performance for reactive propagation and DOM updates.

### 10.3 Flat Buffer Reconciliation

By using `Uint8Array` and `Int32Array` for diffing state tracking, `atomList` eliminates the "GC hum" commonly associated with virtual DOM diffing in large lists. The reconciliation state is stored in a continuous memory block, maximizing CPU cache efficiency and minimizing allocation-time overhead.

- **Sanitization Fast-path**: `sanitizeHtml` includes an early O(n) single-pass scan (`needsSanitization`) to bypass expensive regex scanning for safe strings.
- **Allocation-free Equality**: `shallowEqual` uses manual property counting and `for...in` loops to avoid `Object.keys()` array allocations.

## 12. CPU Branch Prediction Optimizations

To achieve zero-overhead reactive updates, the library implements several techniques to maximize **Pipeline Efficiency** by reducing branch mispredictions in the hot-path.

### 11.1 No-op Proxy Debugging

Instead of checking `if (debug.enabled)` in every updater and loop, the `DebugController` uses a **Method Pointer Swapping** pattern.

- In production (or when disabled), debug methods point to empty No-op functions (`() => {}`).
- When enabled, they refer to the actual logging implementation.

This eliminates thousands of conditional branches from the execution pipeline, keeping the CPU's Branch Target Buffer (BTB) clear for business logic.

### 11.2 Bitmask Dispatch (`atomBind`)

The sequential 12-way `if` chain in `atomBind` was replaced with a **Bitmask Dispatch table**.

1. `atomBind` converts current options into a single 32-bit integer mask.
2. The loop uses bitwise operations (`m & -m`) to isolate the next binding bit.
3. The bit index is calculated using `31 - Math.clz32(bit)`, which V8 compiles to a single `BSR` (Bit Scan Reverse) instruction.
4. The corresponding handler is looked up in the monomorphic `BIND_HANDLERS` table, achieving O(1) jump table dispatching. Tuple arguments (e.g. `[source, formatter]`) are efficiently unpacked using a shared `unpack` utility.

### 11.3 Strategy Specialization (`InputBinding`)

Two-way input bindings often branch based on element type (Text vs. Select-Multiple) and focus state. These branches were eliminated by:

- **Monomorphic `initStrategies`**: Pre-specializing `readDom`, `writeDom`, `equal`, and `format` functions in the constructor.
- **Consolidated `isDomUpToDate`**: Encapsulates functional equality checks (including `parse`-based checks while focused) into a single, predictable path.
- **Bitmask Guards**: Uses the `Busy` mask (Composing | SyncingToAtom | SyncingToDom) for constant-time synchronization gates.

This ensures the updater function's control flow remains identical for a given element type, allowing the CPU to perfectly predict the execution path.

### 11.4 Static Snapshot for Registry Cleanup

Live DOM collections (e.g. `HTMLCollection`) change their length as elements are removed, which causes "unstable loop prediction". `cleanupDescendants` now converts the result to a **static array snapshot**. This stabilizes the loop's iteration count and branch targets, preventing stalls during large DOM teardowns.

### 11.5 Fast-path Sanitization Scan

`sanitizeHtml` performs an O(n) scan for safe characters (`<`, `&`, controls) before running the regex pipeline. For the vast majority of "safe" updates (numbers, plain text), this skips the computationally expensive and branch-heavy regex logic entirely.

## 13. Lenses & Structural Sharing

`$.atomLens` and related utilities are now **re-exported from the Core package**. The jQuery layer provides these via the `$` namespace while delegating the recursive structural sharing logic to the core engine.

### 12.1 Integration with `atomForm`

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
