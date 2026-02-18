# jQuery Integration API

This package extends jQuery with reactive capabilities. All methods are available on jQuery objects (`$(selector).method()`).

## Unified Binding

### `.atomBind(bindings)`

The preferred way to apply multiple bindings at once.

```javascript
$('.user-card').atomBind({
  text: nameAtom,                 // Binds textContent (any reactive source)
  html: bioAtom,                  // Binds sanitized innerHTML
  class: { 'active': isActive },  // Toggles class
  css: { 'color': colorAtom },    // Style property
  attr: { 'data-id': idAtom },    // Attribute (PrimitiveValue)
  prop: { 'disabled': isDisabled },// DOM property (any type)
  show: isVisible,                // show/hide
  hide: isHidden,                 // Inverse of show
  val: inputAtom,                 // Two-way binding: atom or [atom, options]
  checked: isChecked,             // Two-way binding for checkbox/radio
  on: { click: handleClick }      // Event handler
});
```

---

## Content & Attributes

### `.atomText(atom, formatter?)`

Updates `textContent`.

- **formatter**: optional function `(val) => string`.

```javascript
$('#price').atomText(price, p => `$${p.toFixed(2)}`);
```

### `.atomHtml(atom)`

Updates `innerHTML`.

> **🛡️ Security Note**:
> Since version 0.22.0, this method uses a native `DOMParser`-based sanitizer for robust protection. It strips `<script>` tags, `on*` event attributes, and dangerous protocols (`javascript:`, `data:`).
>
> While much safer than regex-based filters, we still recommend using [DOMPurify](https://github.com/cure53/DOMPurify) for complex, user-generated content.
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
- `bind`: `($el, item, index) => void` - Bind events/atoms to the created element.
- `update`: `($el, item, index) => void` - Manually update existing elements (optimization).
- `onAdd`: `($el) => void` - Called when an item is added to the DOM.
- `onRemove`: `($el) => Promise<void> | void` - Called before removal (supports async exit animations).
- `empty`: `string | Element | DocumentFragment | JQuery` - Content to show when the list is empty.

```javascript
$('ul').atomList(usersAtom, {
  key: u => u.id,
  render: u => `<li class="user-item"></li>`, // Container only
  bind: ($el, user) => {
    // Bind internal structure here. This assumes `user.name` is an atom.
    $el.atomText(user.name);
    $el.on('click', () => selectUser(user));
  }
});
```

---

## Form Bindings

### `.atomVal(atom, options?)`

Two-way binding for `<input>`, `<textarea>`, and `<select>`.

**Options**:

- `debounce`: number (ms) - Delay updates to the atom.
- `event`: `string` - Input event to listen to (default: `'input'`).
- `format`: `(val) => string` - Format value on blur.
- `parse`: `(str) => val` - Parse string input before updating atom.
- `equal`: `(a, b) => boolean` - Custom equality check to prevent redundant updates.

```javascript
$('#search').atomVal(queryAtom, { debounce: 300 });
```

### `.atomChecked(atom)`

Two-way binding for `<input type="checkbox">` and `<input type="radio">` elements.

- Uses jQuery's event system for compatibility with `.trigger()`.

```javascript
$('#agree').atomChecked(isAgreedAtom);
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
  - `ajaxOptions`: `JQuery.AjaxSettings` — Full `$.ajax` passthrough.

**Returns**: `ComputedAtom<T>` — reactive value with:

- `.value` — Resolved data (or `defaultValue` while pending).
- `.isPending` — `true` during fetch.
- `.hasError` / `.lastError` — Error state. Only set for real network/server errors; cancellations via abort are not treated as errors.
- `.invalidate()` — Triggers refetch.

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
  - `render`: Custom function `(container, route, params) => void`.
  - `onEnter`: Hook called before rendering. Can return additional params.
  - `onLeave`: Hook called before navigating away. Return `false` to cancel.
- `mode`: (Optional) `'hash'` (default) or `'history'`. Hash mode uses `location.hash` and `hashchange`; history mode uses `pushState`/`popstate`.
- `basePath`: (Optional) Base path prefix for history mode (e.g., `'/app'`). Ignored in hash mode. Default: `''`.
- `notFound`: (Optional) Route name to use when no match is found.
- `autoBindLinks`: (Optional) If `true`, automatically handles clicks on `[data-route]` links.
- `activeClass`: (Optional) CSS class for active links (default: `'active'`).
- `beforeTransition`: (Optional) Global hook `(from, to) => void`.
- `afterTransition`: (Optional) Global hook `(from, to) => void`.

**Returns**:

A `Router` object with:

- `currentRoute`: `WritableAtom<string>` containing the active route name.
- `queryParams`: `ReadonlyAtom<Record<string, string>>` reactive map of URL parameters.
- `navigate(route)`: Programmatically change route.
- `destroy()`: Cleanup listeners and effects.

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
