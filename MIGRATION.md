# Migration Guide: Atom-Effect v0.33.0 & v0.34.0

This guide provides instructions for migrating your codebase to the latest versions of `atom-effect`. Several breaking changes and deprecations have been introduced to improve performance, bundle size (tree-shaking), and development experience.

---

## 1. ES2022 Migration (v0.33.0)

### Changes

Starting with version **v0.33.0**, the library targets **ES2022**. The internal engine has been refactored to utilize modern JavaScript features, most notably **private class fields (`#`)**.

### Motivation

ES2022 private fields provide native encapsulation, preventing accidental access to internal reactive state. This shift also stabilizes V8 hidden classes, leading to better runtime performance.

### Migration Steps

Ensure your environment (Node.js or Browser) supports ES2022. Most modern environments (Node 16.11+, Chrome 91+, Safari 15+) already support these features. If you are using a transpiler (like Babel or SWC), ensure your target is set to ES2022 or higher to avoid unnecessary polyfills.

---

## 2. Error Handling & Types (v0.33.0 & v0.34.0)

### Deprecation of Instance Methods

The `AtomError` class and its subclasses no longer prioritize instance methods for diagnostic tasks. Methods `getChain()` and `toJSON()` are **deprecated in v0.33.0** and will be **removed in v0.34.0**.

#### Migration Steps

Replace instance method calls with standalone functions imported from the core package.

**Before:**

```typescript
const chain = error.getChain();
const json = error.toJSON();
```

**After:**

```typescript
import { getErrorChain, serializeError } from '@but212/atom-effect';

const chain = getErrorChain(error);
const json = serializeError(error);
```

### Type Relocation (v0.33.0)

`AtomErrorConstructor` and `AtomErrorJSON` types have been relocated to the core types module.

#### Migration Steps

Update your imports if you were referencing these types from internal paths or specific error modules.

```typescript
// Correct import
import type { AtomErrorConstructor, AtomErrorJSON } from '@but212/atom-effect';
```

---

## 3. Build System & Distribution (v0.33.0)

### Partitioned Build Process

The build process is now partitioned into specialized targets: `types`, `lib` (ESM/CJS), and `bundle` (UMD).

#### Migration Steps

Always use the documented entry points. Avoid importing from internal paths like `@but212/atom-effect/dist/core/base`.

**Correct usage:**

```typescript
import { atom, computed } from '@but212/atom-effect';
```

### jQuery Externalization

In the jQuery package (`@but212/atom-effect-jquery`), the core `@but212/atom-effect` package is now externalized in ESM and CJS builds.

#### Migration Steps

You must ensure `@but212/atom-effect` is installed as a peer dependency in your project.

### CDN Path Changes

The default entry point for CDNs has changed to favor explicit bundle paths.

#### Migration Steps

Update your `<script>` tags to use the explicit UMD bundle:

```html
<!-- Before -->
<script src="https://cdn.jsdelivr.net/npm/@but212/atom-effect-jquery@0.33.0/index.js"></script>

<!-- After (Recommended) -->
<script src="https://cdn.jsdelivr.net/npm/@but212/atom-effect-jquery@0.33.0/dist/atom-effect-jquery.min.js"></script>
```

---

## 4. Debug System (v0.33.0)

### Changes

The debug system has been decoupled from the core reactive graph. The main bundle no longer contains tracing wrappers, formatting helpers, or logging hooks. Instead, debug utilities reside in a dedicated export `@but212/atom-effect/debug`.

### Migration Steps

In jQuery, access the debug controller via the jQuery namespace.

```typescript
import $ from '@but212/atom-effect-jquery';

// Enable visual debugging
$.debug.enabled = true;
```

---

## 5. Web Component Architecture & DI (v0.34.0)

### Changes

The Web Component integration package (`@but212/atom-effect-jquery`) has shifted to a stateless, explicit lifecycle approach for DOM elements.

### Motivation

Automatic tracking via nested mutation observers created significant performance degradation and memory overhead in deep DOM structures. Explicit dependency registration reduces overhead and simplifies tracking across shadow roots.

### Migration Steps

1. **Explicit Setup Required:** The engine no longer secretly watches the DOM to automatically trigger `setup()` for components with static properties (`aejStyles`, `aejBind`, etc.).
2. **Stateless DI (DOM Traversal):** Dependency Injection (`injectAtom`, `provideAtom`) no longer relies on custom event bubbling (`aej:context-request`). It now uses synchronous DOM traversal (`parentNode` and `ShadowRoot.host`).
3. **Strict Type Safety for Proxies:** `injectAtom` and the underlying `createContextProxy` now explicitly return `WritableAtom<T | null> | null` (previously `WritableAtom<T> | null`).

### Why?

- Eliminating global `MutationObserver` instances drastically reduces memory overhead, prevents memory leaks, and fixes unpredictable initialization timing.
- Synchronous DOM traversal is faster, fully deterministic, and avoids event-loop desync issues inherent to custom events.
- Strict null-checking prevents silent runtime errors when a dependency provider is not found.

### How to Migrate?

#### 1. Explicitly Call `setup()` in `connectedCallback`

If your Web Components relied on static properties (`static aejStyles`, `static aejBind`, etc.) without an explicit `setup()` call, they will no longer initialize automatically. You **must** call `this.aej.setup()` inside `connectedCallback`.

**Before:**

```typescript
class MyComponent extends HTMLElement {
  static aejStyles = [':host { color: red; }'];
  // Engine magically called setup() when appended to DOM
}
```

**After:**

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

#### 2. Handle Nullable Injected Atoms

If you use `$.injectAtom()`, you must now explicitly handle the case where the returned atom's value is `null`.

**Before:**

```typescript
const themeProxy = $.injectAtom<string>(this, 'theme');
// Falsely assumed string. If 'theme' provider didn't exist, this crashed at runtime.
console.log(themeProxy.value.toUpperCase());
```

**After:**

```typescript
const themeProxy = $.injectAtom<string>(this, 'theme');
if (themeProxy && themeProxy.value !== null) {
  console.log(themeProxy.value.toUpperCase());
}
```

#### 3. Stop Relying on `aej:context-request` Events

If you were manually dispatching or intercepting the `aej:context-request` custom event to hack the DI system, this will no longer work. The DI system strictly resolves by crawling up the DOM tree structurally. Ensure all your consumers are actual DOM descendants of your providers.

---

## 4. `$.atomNav` Removal & Utils `Result` Reduction (Unreleased)

### Changes

- `$.atomNav` (PJAX fragment navigation) was removed together with `AtomNav` / `AtomNavOptions` and `navCoordinator`.
- `@but212/atom-effect-utils` `Result` now exposes only `ok`, `err`, `isErr`, `unwrap`, and `tryCatch`; `isResult()` was removed.

### Migration Steps

- Replace `$.atomNav({ target })` with `$.computed` and `fetch`, and render the fragment through `atomHtml` (always sanitized):

```typescript
const page = $.computed(async () => (await fetch(`/fragments/${path.value}`)).text(), {
  defaultValue: '',
});
$('#app-root').atomHtml(page);
```

- Replace `Result.isOk(r)` with `r.ok`; replace `unwrapOr` / `match` / `map` with an explicit `r.ok ? ... : ...` branch.

### `$` namespace reduction (jQuery)

The jQuery package no longer re-exposes helpers that nobody called through `$`: `$.atomLens`, `$.composeLens`, `$.lensFor`, `$.mergeLenses`, `$.mergeAtoms`, `$.isComputed`, `$.isEffect`, `$.untracked`. Import them from `@but212/atom-effect` instead (CDN users: load the core UMD bundle and use its global).

```typescript
import { atomLens, mergeAtoms, untracked } from '@but212/atom-effect';
```

---

## 6. `route`, `fetch`, and Web Component Removal (Unreleased, v0.35.0)

### Changes

`@but212/atom-effect-jquery` no longer ships these APIs:

- `$.route` and the `RouteConfig`, `RouteDefinition`, `RouteLifecycle`, `Router` types.
- `$.atomFetch` and the `FetchOptions`, `FetchError` types.
- `$.useAtomComponent`, `$.provideAtom`, `$.injectAtom` and the `AtomComponentController`, `JQueryScopedSelector` types.

`@but212/atom-effect` `getErrorMetadata` no longer reads `_tag` from plain objects; a thrown `{ _tag: 'FooError', ... }` object reports `name: 'Unexpected error'`. `AtomError` subclasses keep their names.

### Migration Steps

- Remote data: replace `$.atomFetch(url, { defaultValue })` with `$.computed(async () => (await fetch(url)).json(), { defaultValue })`. Dependencies read before the first `await` stay reactive; cancel stale requests with an `AbortController` if needed.
- Routing, Custom Element lifecycle, and context injection: use a dedicated router or native Custom Element APIs, and share state by importing atoms. Pin `@but212/atom-effect-jquery@0.34.1` if you still depend on the removed features.

---

## Support

If you encounter any issues during migration, please open an issue on our [GitHub Issues](https://github.com/but212/atom-effect/issues) page.
