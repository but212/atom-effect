# Migration Guide

Breaking changes and upgrade steps for `@but212/atom-effect`, `@but212/atom-effect-jquery`, and `@but212/atom-effect-utils`, newest first. Every section mirrors the matching entry in [CHANGELOG.md](./CHANGELOG.md).

| Version | Package | Breaking change |
| --- | --- | --- |
| v0.35.0 | jQuery | `$.route`, `$.atomFetch`, `$.useAtomComponent`, `$.provideAtom`, `$.injectAtom` and their types removed |
| v0.35.0 | jQuery | `$.atomNav` removed |
| v0.35.0 | jQuery | `$.atomLens`, `$.composeLens`, `$.lensFor`, `$.mergeLenses`, `$.mergeAtoms`, `$.isComputed`, `$.isEffect`, `$.untracked` removed |
| v0.35.0 | Utils | Most `Result` helpers and `isResult()` removed |
| v0.34.0 | Core | `AtomError.getChain()` and `AtomError.toJSON()` removed |
| v0.34.0 | jQuery | Web Component setup and dependency injection reworked |
| v0.33.0 | Core | Build output partitioned; `AtomErrorConstructor` and `AtomErrorJSON` relocated |
| v0.33.0 | jQuery | Core externalized in library builds; CDN entry point changed |

---

## 1. v0.35.0

### 1.1 jQuery: `route`, `fetch`, and Web Component features removed

`@but212/atom-effect-jquery` no longer ships these APIs or their types:

- `$.route` with `RouteConfig`, `RouteDefinition`, `RouteLifecycle`, `Router`.
- `$.atomFetch` with `FetchOptions`, `FetchError`.
- `$.useAtomComponent`, `$.provideAtom`, `$.injectAtom` with `AtomComponentController`, `JQueryScopedSelector`.

#### Migration Steps

- **Remote data:** replace `$.atomFetch` with `$.computed` over `fetch`. Dependencies read before the first `await` stay reactive.

**Before:**

```typescript
const user = $.atomFetch(() => `/api/users/${userId.value}`, { defaultValue: null });
```

**After:**

```typescript
const user = $.computed(
  async () => (await fetch(`/api/users/${userId.value}`)).json(),
  { defaultValue: null }
);
```

- **Routing, Custom Elements, context injection:** use a dedicated router or native Custom Element APIs, and share state by importing atoms.
- **Staying on the old behavior:** pin `@but212/atom-effect-jquery@0.34.1`.

### 1.2 jQuery: `$.atomNav` removed

`$.atomNav` (PJAX navigation), its `AtomNav` / `AtomNavOptions` types, and the internal `navCoordinator` are removed.

#### Migration Steps

Load the fragment with `$.computed` and `fetch`, then render it through `atomHtml` (always sanitized):

```typescript
const page = $.computed(async () => (await fetch(`/fragments/${path.value}`)).text(), {
  defaultValue: '',
});
$('#app-root').atomHtml(page);
```

### 1.3 jQuery: `$` namespace reduction

`$.atomLens`, `$.composeLens`, `$.lensFor`, `$.mergeLenses`, `$.mergeAtoms`, `$.isComputed`, `$.isEffect`, and `$.untracked` are no longer exposed on `$`.

#### Migration Steps

Import them from `@but212/atom-effect`. CDN users load the core UMD bundle and read them from the global `AtomEffect`.

```typescript
import { atomLens, mergeAtoms, untracked } from '@but212/atom-effect';
```

### 1.4 Utils: `Result` reduction

`Result` now exposes only `ok`, `err`, `isErr`, `unwrap`, and `tryCatch`. Removed: `isOk`, `match`, `expect`, `unwrapOr`, `unwrapOrElse`, `map`, `mapErr`, `andThen`, `tryAsync`, `equals`, `all`, `fromPredicate`, `fromThrowable`, and `isResult()` with its runtime brand symbols.

#### Migration Steps

Branch on `result.ok` instead.

**Before:**

```typescript
if (Result.isOk(r)) use(r.value);
const value = Result.unwrapOr(r, fallback);
```

**After:**

```typescript
if (r.ok) use(r.value);
const value = r.ok ? r.value : fallback;
```

`@but212/atom-effect-utils` now publishes `dist` only; import from the package entry point, not from source paths.

### 1.5 Behavior changes without API removal

- **Core `getErrorMetadata`:** plain objects with a `_tag` ending in `Error` are no longer special-cased. They report `name: 'Unexpected error'`, `recoverable: true`, and no `code`. `AtomError` subclasses are unaffected.
- **Core `{ sync: true }` atoms:** a subscriber that writes back to its own atom now reports a `SchedulerError` and drops the pending notification instead of cycling forever.
- **Core lenses:** a sub-path write through a lens rooted at a merged lens now throws (reads are unchanged). Write the whole value to the merged lens, or write to the owning source atom.
- **jQuery `atomList`:** `onRemove` runs once per removed item. It previously ran twice for items whose key left the list.
- **jQuery `atomForm`:** a field write in a multi-atom form mutates only the source atom that owns the path (the last source defining it, falling back to the first). An empty source array is rejected with a named error at the binding boundary.

---

## 2. v0.34.0

### 2.1 Core: `AtomError` instance methods removed

`AtomError.getChain()` and `AtomError.toJSON()` (deprecated in v0.33.0) are removed.

#### Migration Steps

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

### 2.2 jQuery: Web Component setup and dependency injection

> [!NOTE]
> These APIs were themselves removed in the v0.35.0 changes (see [1.1](#11-jquery-route-fetch-and-web-component-features-removed)). This section applies only if you stay on v0.34.x.

- **Explicit setup:** the engine no longer triggers `setup()` for components with static properties (`aejStyles`, `aejBind`, ...). Call `this.aej.setup()` in `connectedCallback()`.
- **Stateless DI:** `injectAtom` and `provideAtom` resolve contexts by walking `parentNode` and `ShadowRoot.host` instead of `aej:context-request` events. Consumers must be structural DOM descendants of their providers.
- **Nullable proxies:** `injectAtom` and `createContextProxy` now return `WritableAtom<T | null> | null` (previously `WritableAtom<T> | null`).

**Before:**

```typescript
class MyComponent extends HTMLElement {
  static aejStyles = [':host { color: red; }'];
  // setup() ran automatically when appended to the DOM
}

const themeProxy = $.injectAtom<string>(this, 'theme');
console.log(themeProxy.value.toUpperCase());
```

**After:**

```typescript
class MyComponent extends HTMLElement {
  static aejStyles = [':host { color: red; }'];
  private aej = $.useAtomComponent(this);

  connectedCallback() {
    this.attachShadow({ mode: 'open' }); // if needed
    this.aej.setup(); // explicit call required
  }
}

const themeProxy = $.injectAtom<string>(this, 'theme');
if (themeProxy && themeProxy.value !== null) {
  console.log(themeProxy.value.toUpperCase());
}
```

---

## 3. v0.33.0

### 3.1 Core: ES2022 target

The library targets **ES2022** and uses private class fields (`#`).

#### Migration Steps

Run on an ES2022-capable environment (Node 16.11+, Chrome 91+, Safari 15+). If you transpile with Babel or SWC, set the target to ES2022 or higher.

### 3.2 Core: error types and deprecations

- `AtomErrorConstructor` and `AtomErrorJSON` moved to the core types module. `AtomErrorJSON` is exported from the package entry point. `AtomErrorConstructor` is not re-exported there; do not import it from the entry point.

```typescript
import type { AtomErrorJSON } from '@but212/atom-effect';
```

- `AtomError.getChain()` and `AtomError.toJSON()` were deprecated here and removed in [v0.34.0](#21-core-atomerror-instance-methods-removed). Migrate to `getErrorChain()` and `serializeError()` now.

### 3.3 Build output partitioned

The build is split into `types`, `lib` (ESM/CJS), and `bundle` (UMD) targets. Direct `dist/` file references may break.

#### Migration Steps

Use the documented entry points only. Do not import from internal paths such as `@but212/atom-effect/dist/core/base`.

```typescript
import { atom, computed } from '@but212/atom-effect';
```

### 3.4 jQuery: core externalized

`@but212/atom-effect` is externalized in the ESM and CJS builds of `@but212/atom-effect-jquery`.

#### Migration Steps

Make sure `@but212/atom-effect` is installed in your project.

### 3.5 jQuery: CDN entry point

The CDN entry point is now the explicit UMD bundle path.

#### Migration Steps

**Before:**

```html
<script src="https://cdn.jsdelivr.net/npm/@but212/atom-effect-jquery@0.33.0/index.js"></script>
```

**After:**

```html
<script src="https://cdn.jsdelivr.net/npm/@but212/atom-effect-jquery@0.33.0/dist/atom-effect-jquery.min.js"></script>
```

---

## Support

If you encounter any issues during migration, please open an issue on our [GitHub Issues](https://github.com/but212/atom-effect/issues) page.
