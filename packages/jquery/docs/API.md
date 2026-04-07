# jQuery Integration API

This package extends jQuery with reactive capabilities. All methods are available on jQuery objects (`$(selector).method()`).

## Table of Contents

- [Unified Binding (`.atomBind`)](#unified-binding)
- [Content & Attributes](#content--attributes)
- [Control Flow](#control-flow)
- [Form Bindings](#form-bindings)
- [Components](#components)
- [Static Methods](#static-methods)
- [Data Fetching (`$.atomFetch`)](#data-fetching)
- [Routing (`$.route`)](#routing)
- [Debug Mode](#debug-mode)

---

## Unified Binding

### `.atomBind(bindings)`

The preferred way to apply multiple bindings at once. This method uses a **bitmask dispatch strategy** to minimize CPU branch mispredictions, ensuring constant-time (O(1)) invocation overhead even for complex binding maps.

```javascript
$('.user-card').atomBind({
  text: nameAtom,                 // Binds textContent (any reactive source or Promise)
  html: bioAtom,                  // Binds sanitized innerHTML (yields or is string|Promise)
  class: { 'active': isActive },  // Toggles class (yields or is boolean|Promise)
  css: { 'color': colorAtom },    // Style property (yields or is string|number|Promise)
  attr: { 'data-id': idAtom },    // Attribute (yielding PrimitiveValue|Promise)
  prop: { 'disabled': isDisabled },// DOM property (yielding any|Promise)
  show: isVisible,                // show/hide (yielding boolean|Promise)
  hide: isHidden,                 // Inverse of show
  val: inputAtom,                 // Two-way binding: atom or [atom, options]
  checked: isChecked,             // Two-way binding for checkbox/radio
  form: userAtom,                 // Fully automated two-way form binding
  on: { click: handleClick }      // Event handler
});
```

---

## Content & Attributes

### `.atomText(atom, formatter?)`

Updates `textContent`. Supports `AsyncReactiveValue` (direct Promise or atom yielding Promise).

- **formatter**: optional function `(val) => string`.
- **Integrated Binding Support**: When used via `.atomBind()`, can be expressed as a tuple `text: [source, formatter]`.

```javascript
$('#price').atomText(price, p => `$${p.toFixed(2)}`);
// Via atomBind
$el.atomBind({ text: [count, c => `Count: ${c}`] });
```

### `.atomHtml(atom)`

Updates `innerHTML`.

> **🛡️ Security Note**:
> This method uses a high-performance regex-based sanitizer for speed (approx 100x faster). It neutralizes `<script>` tags, `on*` event attributes, and dangerous protocols (`javascript:`, `data:`).
>
> While efficient for most cases, [DOMPurify](https://github.com/cure53/DOMPurify) is recommended for complex, user-generated content to ensure maximum security.
> See the [Security Guide](./SECURITY.md) for details.
>
> ```javascript
> import DOMPurify from 'dompurify';
>
> // Recommended Pattern
> const safeContent = $.computed(() => DOMPurify.sanitize(rawHtml.value));
> $('#container').atomHtml(safeContent);
> ```

Toggles `className` based on the atom's truthiness. Supports multiple space-separated classes in a single key.

- **Overlapping Protection**: Safely handles duplicate classes across multiple reactive keys within the same binding map. Turning one condition off will not remove a class if another active condition still requires it.

```javascript
$('#btn').atomClass('disabled', isLoading);
// Overlapping example
$el.atomClass({ 'active highlight': atom1, 'active large': atom2 });
```

### `.atomCss(property, atom, unit?)`

Updates a single CSS property. An optional `unit` string (e.g. `'px'`, `'%'`) is appended to the value.

```javascript
$('.box').atomCss('opacity', opacityLevel);
$('.box').atomCss('width', widthAtom, 'px'); // Outputs e.g. "120px"
```

### `.atomAttr(attribute, atom)`

Updates an HTML attribute.

- **Security Guards**: Automatically blocks `on*` event handlers and dangerous protocols (`javascript:`) to prevent injection.
- **Constraints**: Accepts `PrimitiveValue` (string, number, boolean, null, undefined).
- **WAI-ARIA**: Boolean `false` is preserved as the string `"false"` for `aria-*` attributes (e.g., `aria-expanded="false"`), not removed. Other attributes treat `false` as removal.

```javascript
$('img').atomAttr('src', imageUrl);
```

### `.atomProp(property, atom)`

Updates a DOM property (e.g., `checked`, `disabled`, `value`).

- **Flexible**: Decoupled from the primary binding generic to allow any property type.

```javascript
$('input').atomProp('disabled', shouldDisable);
```

---

## Control Flow

Toggles visibility (`display: none`). `atomHide` is the inverse — hides the element when the atom is truthy.

- **Style Preservation**: Dynamically captures and restores the last non-none display style. If the element's base style is changed (e.g., from `block` to `flex`) while visible, that change is preserved through subsequent toggle cycles.

```javascript
$('.loading-spinner').atomShow(isLoading);
$('.overlay').atomHide(isDismissed);
```

### `.atomList(listAtom, options)`

Efficiently renders a list of items using keyed diffing.

#### Options

- **`key`**: `keyof T | (item, index) => string | number` (Required) — Property name or function returning a unique ID for diffing.
- **`render`**: `(item, index) => string | Element | DocumentFragment | JQuery` — HTML string, DOM element, DocumentFragment, or jQuery object for new items. Supports multiple root elements (e.g. `<i></i><b></b>`).
- **`bind`**: `($el, item, index) => void` — One-time reactive binding logic for the element.
- **`update`**: `($el, item, index) => void` — Updates existing elements manually when the key remains the same (optimizes to avoid re-binding).
- **`onAdd`**: `($el) => void` — Called after an item is added to the DOM.
- **`onRemove`**: `($el) => Promise<void> | void` — Called before removal (supports async exit animations).
- **`empty`**: `string | Element | DocumentFragment | JQuery` — Content to show when the list is empty.
- **`isEqual`**: `(oldItem, newItem) => boolean` — Custom equality check for item updates (defaults to shallow comparison).
- **`events`**: `Record<string, (item, index, e) => void>` — Delegated event handlers attached to the container. One listener per event type. Key format: `'eventType' or 'eventType selector'`. Handler called with `(item, index, event)`.

```javascript
$('ul').atomList(usersAtom, {
  key: u => u.id,
  render: u => `<li class="user-item"></li>`,
  bind: ($el, user) => {
    $el.atomText(user.name);
  },
  events: {
    'click .delete': (user, index, e) => removeUser(user.id),
    'click': (user, index, e) => selectUser(user),
  }
});
```

---

### Internal Performance Note

The `atomList` reconciliation engine uses a **1D flat buffer strategy** combined with native DOM APIs (`insertBefore`, `appendChild`) for structural updates. This bypasses jQuery's internal overhead (script scanning, context normalization) during the rendering hot path, ensuring O(N) performance even for lists with thousands of items.

#### Memory & Async Safety

All reactive bindings (`atomBind`, `atomText`, etc.) include built-in **Zombie Prevention**. This ensures that asynchronous updates (promises) are automatically discarded if the element is disconnected from the DOM before the resolution completes. Additionally, `atomBind` (via `registerMapEffect`) optimizes multi-promise maps by caching resolved values, allowing subsequent reactive updates to skip redundant async delays.

---

## Form Bindings

### `.atomVal(atom, options?)`

Two-way binding for `<input>`, `<textarea>`, and `<select>`.

**Reliability Features**:

- **IME Stability**: Automatically detects composition state to prevent external updates from breaking character entry (e.g. for Korean/Japanese).
- **Cursor Preservation**: Maintains selection range when the atom is updated while the input is focused.
- **Cycle Prevention**: Built-in guards prevent infinite feedback loops.

Natively supports `<select multiple>` — the atom value is synchronized as a `string[]` array with shallow equality checks.

**Options**:

- `debounce`: number (ms) - Delay updates to the atom.
- `event`: `string` - Input event to listen to (default: `'input'`).
- `format`: `(val) => string` - Format value on blur.
- `parse`: `(str) => val` - Parse string input before updating atom.
- `equal`: `(a, b) => boolean` - Custom equality check to prevent redundant updates.

```javascript
$('#search').atomVal(queryAtom, { debounce: 300 });

// <select multiple> — atom holds string[]
const selected = $.atom([]);
$('#multi-select').atomVal(selected);
```

### `.atomChecked(atom)`

Two-way binding for `<input type="checkbox">` and `<input type="radio">` elements.

- **Radio Sync**: Automatically synchronizes all radio buttons in the same group (`name`) when a value is changed either by user interaction or programmatically via the atom.
- **Robust Selectors**: Uses `$.escapeSelector` to safely target groups even when names contain special characters (e.g. `user[role]`).
- **Compatibility**: Uses jQuery's event system for compatibility with `.trigger()`.

```javascript
$('#agree').atomChecked(isAgreedAtom);
```

### `.atomForm(atom, options?)`

Fully automated two-way binding for an entire form. Binds every input, select, and textarea inside the form to a property of the atom based on their `name` attribute.

- **Deep Paths**: Supports dot-notation and array access in `name` attributes (e.g., `name="user.profile.name"`, `name="items[0].text"`) to bind to nested object properties.
- **Dynamic DOM**: Automatically detects and binds new form controls added to the DOM after the initial call using `MutationObserver`. Also handles field renaming and removal (via ref-counting).
- **Radio & Checkbox Groups**: Native support for radio groups and checkbox groups. Checks are automatically mapped to boolean, string, or array values based on input type and name collision.
- **Circular Protection**: Built-in protection against infinite sync loops between Leaf (element) and Root (atom) states.
- **Optimized**: Uses `form.elements` for O(1) element access and a centralized dispatcher to avoid O(N) effect fan-out on large forms, ensuring typing performance remains constant regardless of form size.

**Options**:

```typescript
interface FormOptions<T> extends ValOptions<T> {
  /** Custom function to transform field value based on path before atomic sync. */
  transform?: (path: string, value: unknown) => unknown;
  /** Callback triggered when a field value changes. */
  onChange?: (path: string, value: unknown) => void;
  /** Debounce duration in milliseconds for DOM -> Atom sync. (Inherited from ValOptions) */
  debounce?: number;
}
```

```javascript
const user = $.atom({ name: 'Alice', age: 30, items: [{ text: 'Item 1' }] });

// Every input with a 'name' attribute is automatically bound
$('form').atomForm(user, {
  debounce: 200,
  transform: (path, val) => (path === 'age' ? Number(val) : val),
  onChange: (path, val) => console.log(`Field ${path} changed to:`, val)
});
```

#### `.atomBind` Example with Form Tuple

The `form` option in `atomBind` also supports a tuple for providing options.

```javascript
$('.my-form').atomBind({
  form: [dataAtom, { debounce: 300 }]
});
```

### `.atomOn(event, handler)`

Lifecycle-aware event listener. The handler is automatically removed when the element is unbound or unmounted.
Additionally, handlers are automatically wrapped in `batch()`, ensuring that multiple atom updates triggered by the event result in a single reactive flush.

Supports all jQuery event signatures, including event maps and `.one()`.

```javascript
$('#btn').atomOn('click', () => doSomething());
// Event Map
$('#btn').atomOn({
  mouseenter: () => (isHovered.value = true),
  mouseleave: () => (isHovered.value = false),
});
```

---

## Components

### `.atomMount(component, props?)`

Mounts a functional component to each selected element. Automatically handles cleanup of existing components and reactive bindings on those elements and their descendants.

- **Batching**: The component function is executed inside a `batch()` cycle, ensuring that multiple initial atom updates result in a single DOM flush.
- **Isolation**: Executed within an `untracked()` block to prevent component logic from subscribing to a parent reactive context.
- **Error Handling**: Mount and cleanup errors are caught and logged as `[atom-mount] Mount/Cleanup error`.

- **component**: `($el, props) => EffectResult` (Function returning an optional cleanup).
- **props**: Optional initial data object.

```javascript
const UserProfile = ($el, { id }) => {
  const data = $.atomFetch(`/api/user/${id}`, { defaultValue: {} });
  $el.atomText($.computed(() => data.value.name));

  return () => console.log('Cleaning up user profile...');
};

$('#root').atomMount(UserProfile, { id: 42 });
```

### `.atomUnmount()`

Disposes all reactive bindings and component cleanups on the selected elements and their descendants. This method is the primary way to manually teardown a component tree from the DOM.

### `.atomUnbind()`

Manually disposes all reactive effects and cleanups registered on the selected elements and their descendants. Does not invoke the component cleanup function — use `.atomUnmount()` for full component teardown. Supports recursive traversal across `DocumentFragment` and `ShadowRoot`.

> **💡 Note**: You generally do not need to call `.atomUnbind()` manually. The library heavily leverages `MutationObserver` to automatically perform memory cleanup when elements are removed from the DOM, even if they are forcibly deleted by external, non-jQuery libraries (e.g. React or vanilla JS `replaceChildren()`).
>
> For **Shadow DOM** support, while the global observer on `document.body` does not cross shadow boundaries, the library provides `enableAutoCleanup(shadowRoot)` to attach independent observers to specific subtrees, or you can manually call `.atomUnbind()` during the component's `disconnectedCallback`.

---

## Static Methods

All lens functions are now officially part of `@but212/atom-effect` (Core) and re-attached to the jQuery namespace for convenience.

### `$.atomLens(atom, path)`

Creates a two-way reactive "lens" for a specific property path on an object-based atom. This "fake" atom allows fine-grained binding to deep properties of a monolithic state atom without extra memory or complex computed logic.

- **atom**: The source `WritableAtom` containing an object.
- **path**: Dot-separated string path (e.g., `'profile.settings.theme'`).

**Returns**: A `WritableAtom` that:

1. **Read/Write**: Directly updates the parent atom at the specified path using structural sharing.
2. **Type Safety**: Uses the `Paths<T>` and `PathValue<T, P>` recursive types (imported from core) for exact compile-time path validation, IDE path autocomplete (up to 8 levels deep), and precise return type inference without `unknown` fallbacks.
3. **Memory Management**: Implements a `.dispose()` method to automatically clean up internal parent atom subscriptions.

```javascript
const store = $.atom({
  user: {
    profile: { name: 'Alice' }
  }
});

const nameLens = $.atomLens(store, 'user.profile.name');

nameLens.value = 'Bob';
console.log(store.value.user.profile.name); // 'Bob'

// Works with bindings
$('#name-input').atomVal(nameLens);

// Manual cleanup (optional, auto-cleaned up if bound via $.fn methods)
nameLens.dispose();
```

### `$.composeLens(lens, path)`

Composes an existing lens with a sub-path to create a deeper, targeted lens. This is functionally equivalent to `$.atomLens(lens, path)` but is named for better clarity in modular designs.

- **lens**: An existing `WritableAtom` (typically created via `$.atom()`, `$.atomLens()`, or `$.composeLens()`).
- **path**: Sub-path string relative to the parent lens.

```javascript
const userLens = $.atomLens(store, 'user');
const profileLens = $.composeLens(userLens, 'profile');
const nameLens = $.composeLens(profileLens, 'name'); // Pointing to store.user.profile.name
```

### `$.lensFor(atom)`

Creates a lens factory bound to a specific atom, which eliminates the need to pass the atom reference on every call.

```javascript
const user = $.atom({ profile: { name: 'Alice', email: 'alice@example.com' } });
const lens = $.lensFor(user); // Factory bound to 'user'

// IDE will autocomplete 'profile.name' and 'profile.email'
const nameLens = lens('profile.name'); // WritableAtom<string>
const emailLens = lens('profile.email'); // WritableAtom<string>
```

---

## Static Methods (Primitive & Control)

### `$.batch(fn)`

Groups multiple atom writes into a single synchronous notification cycle, preventing intermediate re-renders.

```javascript
$.batch(() => {
  nameAtom.value = 'Alice';
  ageAtom.value = 30;
});
```

### `$.untracked(fn)`

Executes a function without establishing reactive dependencies. Useful inside effects when reading an atom value should not create a subscription.

```javascript
$.effect(() => {
  const count = countAtom.value; // tracked
  const snapshot = $.untracked(() => snapshotAtom.value); // not tracked
});
```

### `$.isAtom(v)`, `$.isComputed(v)`, `$.isReactive(v)`, `$.isPromise(v)`

Runtime type checks for reactive nodes and thenables.

```javascript
$.isAtom(myAtom);      // true for WritableAtom
$.isComputed(myComp);  // true for ComputedAtom
$.isReactive(v);       // true for any reactive node (atom or computed)
$.isPromise(v);        // true for Promise or Thenable (including thenable functions)
```

### `$.nextTick()`

Returns a `Promise` that resolves after the next scheduler flush. Effects are processed in microtasks, so `nextTick` (via `Promise.resolve()`) runs immediately after all pending effects in the current tick complete.

```javascript
countAtom.value = 1;
await $.nextTick();
// DOM is now updated
```

---

## Data Fetching

### `$.atomFetch(urlOrFn, options)`

Declarative AJAX primitive. Wraps core's async `computed` with jQuery's `$.ajax`.

**Key Features**:

- **Auto-Cancellation**: Automatically aborts previous pending requests using `AbortController` when dependencies change, `.invalidate()` is called, or when the atom is manually **disposed**. Aborted requests are silently discarded — they do **not** set `hasError`.
- **Reactive URL**: Re-fetches automatically if `urlOrFn` depends on atoms.

**Parameters**:

- `urlOrFn`: `string | () => string` — Static URL or a function that reads atoms (auto-refetches on change).
- `options`: `FetchOptions<T>`
  - `defaultValue`: `T` (Required) — Value before first response.
  - `method`: `string` — HTTP method (default: `'GET'`).
  - `headers`: `Record<string, string>` — Request headers.
  - `transform`: `(raw: unknown) => T` — Response transformer.
  - `ajaxOptions`: `JQuery.AjaxSettings | () => JQuery.AjaxSettings` — Full `$.ajax` passthrough. When a **function** is provided, it is called on every request and its atom reads are automatically tracked, enabling reactive request payloads (e.g., dynamic headers or body). Static options (`method`, `headers`) are merged as the base, with dynamic values on top. Note: the top-level `method` option only overrides `ajaxOptions.method` if it is explicitly provided.

**Returns**: `ComputedAtom<T>` — reactive value with:

- `.value` — Resolved data (or `defaultValue` while pending).
- `.isPending` — `true` during fetch.
- `.hasError` / `.lastError` — Error state. Only set for real network/server errors; cancellations via abort are not treated as errors.
- `.abort()` — Cancels the current pending request.
- `.invalidate()` — Triggers refetch.

**Additional Options**:

- `onError`: `(err: unknown) => void` — Called when the fetch fails with an error (not called on abort/cancellation).
- `eager`: `boolean` — If `false`, the first fetch is deferred until `.invalidate()` is called or a dependency changes. Default: `true`.

```javascript
const userId = $.atom(1);
const user = $.atomFetch(() => `/api/users/${userId.value}`, {
  defaultValue: null,
});

// Bind to DOM
$('#name').atomText(user, u => u?.name ?? '');
$('#spinner').atomShow(user.isPending);
$('#error').atomShow(user.hasError);
$('#retry').atomOn('click', () => user.invalidate());

// Change userId → auto-refetches
userId.value = 2;
```

```javascript
// With transform and headers
const count = $.atomFetch('/api/items', {
  defaultValue: 0,
  method: 'GET',
  headers: { Authorization: 'Bearer token' },
  transform: (raw) => raw.items.length,
});
```

---

## Routing

### `$.route(config)`

Creates an SPA router with reactive state management. Supports both hash-based and pushState-based (history) routing.

**Configuration**:

- `target`: Selector for the container element where routes will be rendered.
- `default`: Name of the default route to load if the URL is empty.
- `routes`: Object mapping route names to definitions. Each route must specify **either** `template` **or** `render`, but not both (mutually exclusive).
  - `template`: Selector for a `<template>` element to clone.
  - `render`: Custom function `(container, name, params, onUnmount, router) => void`.
    - `onUnmount`: Callback `(cleanupFn) => void` to register side-effect cleanups for the route.
  - `onEnter`: Hook called before rendering. Can return an object to merge into `params`.
  - `onLeave`: Hook called before navigating away. Return `false` to cancel.
  - `onMount`: `($content: JQuery, onUnmount, router) => void` — **Template routes only.** Called after template content is appended.
- `mode`: (Optional) `'hash'` (default) or `'history'`. Hash mode uses `location.hash` and `hashchange`; history mode uses `pushState`/`popstate`.
- `basePath`: (Optional) Base path prefix for history mode (e.g., `'/app'`). Ignored in hash mode. Default: `''`.
- `notFound`: (Optional) Route name to use when no match is found.
- `autoBindLinks`: (Optional) If `true`, automatically handles clicks on `[data-route]` links.
- `activeClass`: (Optional) CSS class for active links (default: `'active'`).
- `beforeTransition`: (Optional) Global hook `(from, to) => void`.
- `afterTransition`: (Optional) Global hook `(from, to) => void`.

**Returns**:

A `Router` object with:

- `currentRoute`: `ReadonlyAtom<string>` containing the active route name.
- `queryParams`: `ReadonlyAtom<Record<string, string>>` reactive map of URL parameters.
- `navigate(route)`: Programmatically change route. Supports query strings (e.g., `navigate('user?id=123')`). Empty string navigates to `default`.
- `destroy()`: Cleanup listeners, effects, and template cache.

**Example**:

```javascript
// Hash mode (default)
const router = $.route({
  target: '#app',
  default: 'home',
  autoBindLinks: true,
  routes: {
    home: { template: '#tmpl-home' },
    about: { template: '#tmpl-about' },
    user: {
      render: (el, route, params, onUnmount) => {
        // Use reactive bindings inside render for full capability
        $(el).atomText($.computed(() => `User ID: ${params.id}`));
      }
    }
  }
});

// History mode (pushState)
const historyRouter = $.route({
  target: '#app',
  default: 'home',
  mode: 'history',
  basePath: '/my-app',
  autoBindLinks: true,
  routes: {
    home: { template: '#tmpl-home' },
    about: { template: '#tmpl-about' },
  }
});
// Navigates to /my-app/about using pushState
historyRouter.navigate('about');
```

---

## Debug Mode

The library includes a built-in debug mode to help you visualize reactive updates and troubleshoot issues.

### Enabling Debug Mode

You can enable debug mode in several ways:

1. **Global Toggle**: Set `window.__ATOM_DEBUG__ = true` before the library loads.
2. **Environment Variable**: Set `VITE_ATOM_DEBUG=true` in your `.env` file (for Vite projects).
3. **Runtime**: Toggle `$.atom.debug = true` or `debug.enabled = true` from the console.

### Visual Feedback

When enabled:

- **Console Logs**: Every DOM update is logged with its selector (e.g., `[atom-binding] DOM updated: div#app.main.text = new value`).
- **Visual Highlighting**: Updated elements are temporarily outlined with a red border. This highlight uses a non-blocking `requestAnimationFrame` loop and is automatically cleaned up after a short duration, even if the element is removed from the DOM.
- **Selector Precision**: Logs use a precise `tag#id.class` format (including SVG support) to help you identify the exact source of a change.
