# jQuery Integration API

This package extends jQuery with reactive capabilities. All methods are available on jQuery objects (`$(selector).method()`).

## Unified Binding

### `.atomBind(bindings)`

The preferred way to apply multiple bindings at once.

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

```javascript
$('#price').atomText(price, p => `$${p.toFixed(2)}`);
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

### `.atomClass(className, booleanAtom)`

Toggles `className` based on the atom's truthiness.

```javascript
$('#btn').atomClass('disabled', isLoading);
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

### `.atomShow(booleanAtom)` / `.atomHide(booleanAtom)`

Toggles visibility (`display: none`). `atomHide` is the inverse — hides the element when the atom is truthy.

```javascript
$('.loading-spinner').atomShow(isLoading);
$('.overlay').atomHide(isDismissed);
```

### `.atomList(listAtom, options)`

Efficiently renders a list of items using keyed diffing.

**Options**:

- `key`: `keyof T | (item, index) => string | number` (Required) - Property name or function returning a unique ID for diffing.
- `render`: `(item, index) => string | Element | DocumentFragment | JQuery` - HTML string, DOM element, DocumentFragment, or jQuery object for new items.
- `bind`: `($el, item, index) => void` - Bind events/atoms to the created element. Runs once when the item is first added.
- `update`: `($el, item, index) => void` - Manually update existing elements when data changes but the key remains the same (optimization to avoid re-rendering).
- `onAdd`: `($el) => void` - Called after an item is added to the DOM.
- `onRemove`: `($el) => Promise<void> | void` - Called before removal (supports async exit animations).
- `empty`: `string | Element | DocumentFragment | JQuery` - Content to show when the list is empty.
- `isEqual`: `(oldItem, newItem) => boolean` - Custom equality check for item updates (defaults to shallow comparison).
- `events`: `Record<string, (item, index, e) => void>` - Delegated event handlers attached to the container. One listener per event type regardless of item count. Key format: `'eventType'` or `'eventType selector'`. Handler receives the original item and its current index.

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

## Form Bindings

### `.atomVal(atom, options?)`

Two-way binding for `<input>`, `<textarea>`, and `<select>`.

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

- Uses jQuery's event system for compatibility with `.trigger()`.

```javascript
$('#agree').atomChecked(isAgreedAtom);
```

### `.atomForm(atom, options?)`

Fully automated two-way binding for an entire form. Binds every input, select, and textarea inside the form to a property of the atom based on their `name` attribute.

- **Deep Paths**: Supports dot-notation in `name` attributes (e.g., `name="user.profile.name"`) to bind to nested object properties.
- **Dynamic DOM**: Automatically detects and binds new form controls added to the DOM after the initial call.
- **Optimized**: Uses `form.elements` for O(1) element access and a centralized dispatcher to avoid O(N) effect fan-out on large forms, ensuring typing performance remains constant regardless of form size.

```javascript
const user = $.atom({ name: 'Alice', role: 'admin' });

// Every input with a 'name' attribute is automatically bound
$('form').atomForm(user);
```

### `.atomOn(event, handler)`

Lifecycle-aware event listener. The handler is automatically removed when the element is unbound or unmounted.

```javascript
$('#btn').atomOn('click', () => doSomething());
```

---

## Components

### `.atomMount(component, props?)`

Mounts a functional component to an element. Automatically handles cleanup of existing components and reactive effects on that element.

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

Triggers the unmount sequence: executes the component's cleanup function and disposes of all nested reactive bindings.

### `.atomUnbind()`

Manually disposes all reactive effects and cleanups registered on the selected elements and their descendants. Does not invoke the component cleanup function — use `.atomUnmount()` for full component teardown.

---

## Static Methods

### `$.atom(val)`, `$.computed(fn)`, `$.effect(fn)`

Aliases to the core functions, exposed for convenience.

`$.atom` also exposes a **`$.atom.debug`** boolean accessor. Setting it to `true` enables internal debug logging across the reactive system.

### `$.atomLens(atom, path)`

Creates a two-way reactive "lens" for a specific property path on an object-based atom. This "fake" atom allows fine-grained binding to deep properties of a monolithic state atom without extra memory or complex computed logic.

- **atom**: The source `WritableAtom` containing an object.
- **path**: Dot-separated string path (e.g., `'profile.settings.theme'`).

**Returns**: A `WritableAtom` that reads from and writes to the specified path.

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
```

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

### `$.isAtom(v)`, `$.isComputed(v)`, `$.isReactive(v)`

Runtime type checks for reactive nodes.

```javascript
$.isAtom(myAtom);      // true for WritableAtom
$.isComputed(myComp);  // true for ComputedAtom
$.isReactive(v);       // true for any reactive node (atom or computed)
```

### `$.nextTick()`

Returns a `Promise` that resolves after the next scheduler flush. Effects are processed in microtasks, so `nextTick` (via `setTimeout`) runs after all pending effects complete.

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

- **Auto-Cancellation**: Automatically aborts previous pending requests using `AbortController` when dependencies change or `.invalidate()` is called. Aborted requests are silently discarded — they do **not** set `hasError`.
- **Reactive URL**: Re-fetches automatically if `urlOrFn` depends on atoms.

**Parameters**:

- `urlOrFn`: `string | () => string` — Static URL or a function that reads atoms (auto-refetches on change).
- `options`: `FetchOptions<T>`
  - `defaultValue`: `T` (Required) — Value before first response.
  - `method`: `string` — HTTP method (default: `'GET'`).
  - `headers`: `Record<string, string>` — Request headers.
  - `transform`: `(raw: unknown) => T` — Response transformer.
  - `ajaxOptions`: `JQuery.AjaxSettings | () => JQuery.AjaxSettings` — Full `$.ajax` passthrough. When a **function** is provided, it is called on every request and its atom reads are automatically tracked, enabling reactive request payloads (e.g., dynamic headers or body). Static options (`method`, `headers`) are merged as the base, with dynamic values on top.

**Returns**: `ComputedAtom<T>` — reactive value with:

- `.value` — Resolved data (or `defaultValue` while pending).
- `.isPending` — `true` during fetch.
- `.hasError` / `.lastError` — Error state. Only set for real network/server errors; cancellations via abort are not treated as errors.
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
- `navigate(route)`: Programmatically change route. Empty string navigates to `default`.
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
      render: (el, route, params) => {
        el.innerHTML = `User ID: ${params.id}`;
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
