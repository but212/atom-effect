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
                 │  list.ts      ← Keyed list diff   │
                 │  route.ts     ← SPA router        │
                 │  mount.ts     ← Component mount   │
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

### 2.2 Binding Context

`createContext(el)` in `unified.ts` provides a shared context object per element:

```typescript
interface BindingContext {
  $el: JQuery;        // Lazy jQuery wrapper (allocated only when needed)
  el: HTMLElement;     // Raw DOM element (fast path)
  trackCleanup(fn): void;  // Registers cleanup with registry
}
```

The lazy `$el` getter avoids unnecessary jQuery object creation for bindings that only need native DOM access.

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

- **Metadata Caching**: Complex bindings like `atomClass`, `atomCss`, `atomAttr`, and `atomProp` pre-calculate metadata (e.g., camelCase property names, ARIA flags, URL-bearing status) during the initial registration. This avoids repeated string manipulations and regex checks inside the reactive update loop.
- **JS-Level Value Caching**: `bindAttr` maintains a JS-side cache of the last written attribute value. This allows it to skip expensive `getAttribute` DOM calls (which require crossing the DOM boundary) to determine if a write is necessary.
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

`enableAutoCleanup(root)` installs a `MutationObserver` on the specified `root` element that watches for removed nodes. Multiple roots can be observed concurrently (e.g., for micro-frontends).

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

### Features

- **IME Support**: `compositionstart`/`compositionend` events gate sync to prevent partial character commits.
- **Debounce**: Optional delay before DOM→Atom sync, with flush on blur.
- **Focus Awareness**: Preserves cursor position when atom updates while input is focused.
- **Cycle Prevention**: `BindingFlags` bitfield prevents sync loops (SyncingToAtom/SyncingToDom guards).
- **Parse/Format**: Custom transform functions for type coercion (e.g., string ↔ number).

## 5. List Reconciliation

`atomList` (`list.ts`) renders reactive arrays using a high-performance **1D flat buffer reconciliation** algorithm:

1. **Prefix/Suffix Trimming**: Identifies and skips common items at the start and end of the list.
2. **Key Mapping**: Maps remaining items to unique keys for diffing.
3. **Flat Buffer Diffing**: Uses typed arrays (`Uint8Array` for states, `Int32Array` for moves) instead of intermediate objects to track transitions (added, removed, replaced, moved). Items with identical keys but different contents are marked for `update`.
4. **Patching**: Synchronizes the DOM using the calculated transition map with minimal moves and removals.
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
  walk e.target → parentElement chain
    → elToKey (WeakMap<Element, key>)           // O(1) root lookup
    → itemMap.get(key)                          // O(1) entry lookup
    → keyToIndex.get(key)                       // O(1) index lookup
    → handler(item, index, e)
```

Both indexes (`elToKey`, `keyToIndex`) are kept in sync at the end of every effect run and cleared via `registry.trackCleanup` on container teardown.

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

- Auto-unmounts existing components when mounting a new one on the same element.
- Double-unmount protection via `WeakMap.delete()` atomic guard.
- Cleanup errors are caught and logged without propagation.

## 7. SPA Router

`$.route()` (`route.ts`) provides SPA routing with reactive state. Supports both **hash** (`location.hash` / `hashchange`) and **history** (`pushState` / `popstate`) modes.

```text
Hash mode:    window.location.hash  ──▶  currentRoute (atom)  ──▶  renderEffect (effect)
History mode: window.location.pathname ──▶  queryParams (atom)   ──▶  renderRoute()
                                                                       ├── template cloning
                                                                       └── custom render fn
```

The router is entirely **reactive**. Navigation (`navigate()` or URL change) updates the `currentRoute` and `queryParams` atoms. A single core `effect` (`renderEffect`) observes these atoms and triggers `renderRoute()` when they change.

### Mode Abstraction

The hash/history difference is isolated to 5 internal functions, so all rendering, guard, and link-binding logic is shared:

| Function | Hash mode | History mode |
| --- | --- | --- |
| `getRouteName()` | Parses `location.hash` | Extracts from `pathname` after `basePath` |
| `getQueryParams()` | Parses `?` in hash string | Parses `location.search` |
| `setUrl(route)` | Sets `location.hash` | Calls `history.pushState()` |
| `restoreUrl()` | Reverts `location.hash` | Calls `history.replaceState()` |
| `getCurrentUrl()` | Returns `location.hash` | Returns `pathname + search` |

### Key Design Decisions

- **Reactive**: `currentRoute` is a `ReadonlyAtom` — external code reads it reactively but must use `navigate()` to change routes, keeping the URL in sync.
- **Navigation Guards**: `onLeave` hooks can return `false` to block navigation. URL is restored on block (hash revert or `replaceState`).
- **Event Delegation**: `autoBindLinks` uses `$(document).on('click', '[data-route]')` for dynamically added links.
- **Active State**: Active-link class management uses a reactive `effect` that re-runs whenever `currentRoute` changes, updating all `[data-route]` links in a single pass — more efficient than a persistent `MutationObserver`.
- **Backwards Compatible**: Default mode is `'hash'`, preserving existing behavior.

## 8. Security

The binding layer includes defensive measures against XSS:

- `bindHtml`: Sanitizes content via `sanitizeHtml()` (removes `<script>`, `on*` events, `javascript:` protocols).
- `bindAttr`: Blocks `on*` event handler attributes and dangerous URL protocols.
- `bindCss`: Blocks CSS values containing `expression()`, `url(javascript:)`, etc.
- `bindProp`: Blocks dangerous properties (`innerHTML`, `outerHTML`), prototype pollution vectors (`__proto__`, `constructor`, `prototype`), `on*` event handlers, and checks mapped URL properties for dangerous protocols.

These are **first-pass filters**. For user-generated content, [DOMPurify](https://github.com/cure53/DOMPurify) is recommended. See the [Security Guide](./SECURITY.md) for integration patterns.

## 9. Module Structure

```text
packages/jquery/src/
  index.ts          — Entry point, plugin registration, auto-init
  constants.ts      — Internal constants and log prefixes
  types.ts          — TypeScript global and internal type definitions
  core/
    namespace.ts      — $.atom, $.computed, $.effect, $.nextTick statics
    effect-factory.ts — registerReactiveEffect (creates and registers effects)
    registry.ts       — WeakMap-based binding registry + MutationObserver cleanup
    jquery-patch.ts   — jQuery method patches (.on batch, .remove cleanup)
  bindings/
    chainable.ts      — $.fn.atomText, $.fn.atomVal, etc. (jQuery methods)
    unified.ts        — Binding handler implementations + atomBind
    input-binding.ts  — Two-way input binding with IME/debounce/cursor support
    form.ts           — Fully automated form binding with lens-based deep paths
    list.ts           — atomList with keyed LIS-based reconciliation
    mount.ts          — atomMount / atomUnmount component lifecycle
  features/
    route.ts          — SPA router (hash + history mode) with reactive state
    fetch.ts          — $.atomFetch declarative AJAX primitive
  internal/
    pool.ts           — Centralized Object/Array pools for low-latency memory reuse
  utils/
    index.ts          — DOM selectors, type classification, and LIS algorithm
    debug.ts          — Debug mode logging and visual highlighting
    sanitize.ts       — Regex-based HTML sanitization and URL protocol security
    array-pool.ts     — LIFO array pooling utility
    object-pool.ts    — Monomorphic object pooling utility
```

## 10. Performance & Memory Management

### 10.1 Object & Array Pooling

To minimize Garbage Collection (GC) pressure in highly dynamic applications (e.g., large lists, frequent component mounting), the library implements structured pooling for short-lived objects and arrays.

#### 10.1.1 `ObjectPool<T>`

The `ObjectPool` utility (`utils/object-pool.ts`) manages a stack of reusable plain objects.

- **Monomorphic Shape**: The pool factory ensures all created objects share the same "hidden class" in V8.
- **LIFO Strategy**: Uses a Last-In-First-Out (stack) approach to improve CPU cache locality.
- **Strict Reset**: Every object is passed through a `reset` callback before being returned to the pool to prevent stale data/reference leaks.

#### 10.1.2 Reused Structures

1. **`BindingRecord`**: Created per bound element. Pooling these avoids thousands of micro-allocations during initial page hydration or route transitions.
2. **`ListItemEntry`**: Created per item in `atomList`. In lists with high churn (sorting, filtering, infinite scroll), pooling entries reduces memory fragmentation and the frequency of "Stop-the-world" GC cycles.
3. **`ArrayPool`**: Reuses arrays used for `effects` and `cleanups` lists within a `BindingRecord`.

### 10.2 Monomorphic Records

All internal state records are initialized with a fixed set of fields. By avoiding "shape transitions" (adding properties after creation), the objects remain **Monomorphic**. This allows V8 to use **Inline Caching (IC)** for property access, resulting in near-native lookup speeds.

### 10.3 Flat Buffer Reconciliation

By using `Uint8Array` and `Int32Array` for diffing state tracking, `atomList` eliminates the "GC hum" commonly associated with virtual DOM diffing in large lists. The reconciliation state is stored in a continuous memory block, maximizing CPU cache efficiency and minimizing allocation-time overhead.

## 11. Lenses & Structural Sharing

`$.atomLens` (`core/lens.ts`) provides a mechanism for fine-grained reactivity over monolithic state objects. It creates a "virtual atom" that points to a specific path within a parent atom.

### 11.1 Structural Sharing

When a value is updated through a lens, the lens implementation uses a recursive helper (`setDeepValue`) to create a new object tree. It only clones the objects along the path to the changed property, while preserving references to all other parts of the object tree.

This "Structural Sharing" approach ensures that:

1. **Minimal Re-renders**: Unrelated parts of the state tree remain reference-equal (`===`), so effects watching those parts do not re-trigger.
2. **Memory Efficiency**: Avoids deep cloning the entire state object on every small change.
3. **Equality Guards**: If the new value is identical to the current value (via `Object.is`), the parent atom is not updated at all, preventing unnecessary reactive propagation.

### 11.2 Integration with `atomForm`

`atomForm` leverages lenses internally to bind individual form fields to deep state paths. This allows a single large state atom to drive a complex form without requiring the developer to manually create hundreds of computed atoms or sub-atoms.
