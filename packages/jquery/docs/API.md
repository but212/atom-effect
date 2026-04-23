# jQuery Integration API

This package extends jQuery with reactive capabilities. All methods are available on jQuery objects (`$(selector).method()`).

## Table of Contents

- [CDN / UMD Usage](#cdn--umd-usage)
- [Unified Binding (`.atomBind`)](#unified-binding)
- [Content & Attributes](#content--attributes)
- [Control Flow](#control-flow)
- [Form Bindings](#form-bindings)
- [Components](#components)
- [Web Components (`$.useAtomComponent`)](#web-components)
- [Dependency Injection (`$.provideAtom`, `$.injectAtom`)](#dependency-injection)
- [Static Methods](#static-methods)
- [Data Fetching (`$.atomFetch`)](#data-fetching)
- [Routing (`$.route`)](#routing)
- [PJAX Navigation (`$.atomNav`)](#pjax-navigation)
- [Debug Mode](#debug-mode)

---

## CDN / UMD Usage

When using the library via a CDN (e.g., jsDelivr or unpkg), the library is exposed through the global `AtomEffectJQuery` namespace.

### Global Namespace

The following utilities and constants are available on the global `AtomEffectJQuery` object:

- `initAEJ(config)`: Unified entry point for library configuration (patches, auto-cleanup).
- `enableAutoCleanup(container)`: Attach a MutationObserver to a specific element.
- `disableAutoCleanup()`: Remove all global observers.
- `enablejQueryOverrides(options)`: Enable patches for jQuery's native methods.
- `nextTick()`: Utility for waiting until the next reactive flush.
- `cleanup(element)`: Trigger a recursive cleanup on an element.
- `debug`: Access to the runtime-toggleable debug controller.

### Library Configuration (`$.initAEJ`)

The library auto-initializes on `document.body` by default. You can use `$.initAEJ` to configure behavior or target specific roots:

```javascript
// Example: Customize patches and target a specific container
$.initAEJ({
  patch: { lifecycle: true, events: false },
  autoCleanup: { root: myContainer }
});

// Example: Manual mode (disable auto features)
$.initAEJ({ patch: false, autoCleanup: false });
```

> **Note**: Subsequent calls to `initAEJ` replace the existing configuration.

### Extending jQuery

The library extends the global `jQuery` (or `$`) object. Methods like `$.atom()`, `$.computed()`, and `.atom*()` chainable methods are available upon script load.

---

## Unified Binding

### `.atomBind(bindings)`

A centralized method for applying multiple bindings. It utilizes a task-based loop strategy that filters active tasks prior to element iteration to manage overhead.

```javascript
$('.user-card').atomBind({
  text: nameAtom,                 // Binds textContent (reactive source or Promise)
  html: bioAtom,                  // Binds sanitized innerHTML
  class: { 'active': isActive },  // Toggles class
  css: { 'color': colorAtom },    // Style property
  attr: { 'data-id': idAtom },    // Attribute
  prop: { 'disabled': isDisabled },// DOM property
  show: isVisible,                // show/hide
  hide: isHidden,                 // Inverse of show
  val: inputAtom,                 // Two-way binding: atom or [atom, options]
  checked: isChecked,             // Two-way binding for checkbox/radio
  form: userAtom,                 // Automated two-way form binding
  on: { click: handleClick }      // Event handler
});
```

---

## Content & Attributes

### `.atomText(atom, formatter?)`

Updates `textContent`. Supports `AsyncReactiveValue` (direct Promise or atom yielding Promise).

- **formatter**: optional function `(val) => string`.
- **Binding Support**: When used via `.atomBind()`, can be expressed as a tuple `text: [source, formatter]`. Supports both atoms and static values.

```javascript
$('#price').atomText(price, p => `$${p.toFixed(2)}`);
// Via atomBind
$el.atomBind({ text: [count, c => `Count: ${c}`] });
```

### `.atomHtml(atom)`

Updates `innerHTML`.

> **🛡️ Security Implementation**:
> This method implements a DOM-based sanitizer using an inert `<template>` and a recursive tree-walker. It transforms untrusted tags (`<script>`, `<iframe>`, etc.) into inert `<span>` wrappers and strips `on*` attributes and untrusted protocols (`javascript:`, `data:`, etc.).
>
> **Features**:
>
> - **DOM Clobbering Protection**: Uses prototype-level descriptors to prevent input from shadowing internal element properties.
> - **Attribute Scrubbing**: Attributes from transformed nodes are processed immediately.
> - **Recursive Validation**: Sanitizes nested contexts including `<template>` content and `srcdoc` sinks.
>
> For complex user-generated content, integrating a library like [DOMPurify](https://github.com/cure53/DOMPurify) is supported.
>
> ```javascript
> import DOMPurify from 'dompurify';
>
> // Pattern for external sanitization
> const safeContent = $.computed(() => DOMPurify.sanitize(rawHtml.value));
> $('#container').atomHtml(safeContent);
> ```

### `.atomClass(className, atom)` or `.atomClass(classMap)`

Toggles `className` based on the atom's truthiness. Supports multiple space-separated classes in a single key.

- **Class Management**: Handles duplicate classes across multiple reactive keys. A class remains if any associated condition is active.

```javascript
$('#btn').atomClass('disabled', isLoading);
// Multi-class example
$el.atomClass({ 'active highlight': atom1, 'active large': atom2 });
```

### `.atomCss(property, atom, unit?)` or `.atomCss(propertyMap)`

Updates a single CSS property. An optional `unit` string (e.g. `'px'`) is appended to the value.

```javascript
$('.box').atomCss('opacity', opacityLevel);
$('.box').atomCss('width', widthAtom, 'px');
```

### `.atomAttr(attribute, atom)` or `.atomAttr(attributeMap)`

Updates an HTML attribute.

- **Security**: Blocks `on*` event handlers and protocols such as `javascript:`. This applies to both HTML and SVG attributes (e.g., `fill`, `filter`).
- **HTML Sinks**: Monitors and sanitizes sensitive sinks like `srcdoc`.
- **WAI-ARIA**: Boolean `false` is preserved as the string `"false"` for `aria-*` attributes instead of being removed.

```javascript
$('img').atomAttr('src', imageUrl);
```

### `.atomProp(property, atom)` or `.atomProp(propertyMap)`

Updates a DOM property.

- **Type Safety**: Uses the `unknown` type for property values.
- **Security**: Blocks access to sensitive properties (`innerHTML`, `outerHTML`, `srcdoc`) and prototype vectors (`__proto__`, `constructor`, `prototype`).

```javascript
$('input').atomProp('disabled', shouldDisable);
```

---

## Control Flow

### `.atomShow(atom)` / `.atomHide(atom)`

Toggles visibility via `display: none`. `atomHide` is the inverse.

- **Style Preservation**: Captures and restores the last non-none display style.

```javascript
$('.loading-spinner').atomShow(isLoading);
```

### `.atomList(listAtom, options)`

Renders a list of items using keyed diffing.

#### Options

- **`key`**: `keyof T | (item, index) => string | number` (Required) — Property name or function returning a unique ID.
- **`render`**: `(item, index) => string | Element | DocumentFragment | JQuery` — Template for new items.
- **`bind`**: `($el, item, index) => void` — Reactive binding logic for the element.
- **`update`**: `($el, item, index) => void` — Manual update logic for existing elements.
- **`onAdd`** / **`onRemove`**: Lifecycle callbacks. `onRemove` supports async exit animations.
- **`events`**: Delegated event handlers attached to the container.

```javascript
$('ul').atomList(usersAtom, {
  key: u => u.id,
  render: u => `<li class="user-item"></li>`,
  bind: ($el, user) => {
    $el.atomText(user.name);
  }
});
```

#### Performance Implementation

The `atomList` engine uses a greedy placement strategy with native DOM APIs (`insertBefore`, `appendChild`) for structural updates. This avoids jQuery's internal overhead (script scanning, context normalization), resulting in linear (O(N)) performance for large lists.

#### Lifecycle & Async Management

Reactive bindings include lifecycle management that cancels pending asynchronous updates if the element is disconnected from the DOM. `atomBind` synchronizes multi-promise maps to prevent partial state updates during transitions.

---

## Form Bindings

### `.atomVal(atom, options?)`

Two-way binding for `<input>`, `<textarea>`, and `<select>`.

**Implementation Details**:

- **IME Stability**: Monitors composition states to prevent external updates from interrupting character entry (e.g., for CJK languages).
- **Cursor Preservation**: Maintains selection range during reactive updates when the input is focused.
- **Cycle Prevention**: Includes guards against infinite feedback loops.

Natively supports `<select multiple>` as a `string[]` array.

**Options**:

- `debounce`: number (ms) - Delay updates to the atom.
- `format` / `parse`: Value transformation hooks.
- `equal`: Custom equality check.

```javascript
$('#search').atomVal(queryAtom, { debounce: 300 });
```

### `.atomChecked(atom)`

Two-way binding for checkbox and radio elements.

- **Radio Sync**: Synchronizes all radio buttons in the same group (`name`) upon value changes.
- **Selectors**: Uses `$.escapeSelector` to handle names with special characters.

```javascript
$('#agree').atomChecked(isAgreedAtom);
```

### `.atomForm(atom, options?)`

Automated two-way binding for an entire form. Maps form controls to atom properties based on their `name` attribute.

- **Nested Paths**: Supports dot-notation and array access (e.g., `user.profile.name`) via `atomLens`.
- **Dynamic DOM**: Detects and binds new form controls added via `MutationObserver`.
- **Group Support**: Maps radio and checkbox groups to boolean, string, or array values.
- **Sync Logic**: Prioritizes `atomLens` data structures to manage synchronization and avoid redundant propagation.
- **Performance**: Uses the lens recursive update engine to maintain performance for leaf updates in complex forms.

```javascript
const user = $.atom({ name: 'Alice', age: 30, items: [{ text: 'Item 1' }] });

$('form').atomForm(user, {
  debounce: 200,
  transform: (path, val) => (path === 'age' ? Number(val) : val)
});
```

### `.atomOn(event, handler)`

Lifecycle-aware event listener. Handlers are removed when the element is unbound and are wrapped in `batch()` to consolidate reactive updates.

```javascript
$('#btn').atomOn('click', () => doSomething());
```

---

## Components

### `.atomMount(component, props?)`

Mounts a functional component to selected elements. Manages cleanup of existing components and reactive bindings.

- **Batching**: Executes inside a `batch()` cycle to consolidate initial updates.
- **Isolation**: Executed within an `untracked()` block to prevent subscription to parent reactive contexts.

```javascript
const UserProfile = ($el, { id }) => {
  const data = $.atomFetch(`/api/user/${id}`, { defaultValue: {} });
  $el.atomText($.computed(() => data.value.name));

  return () => console.log('Cleanup logic...');
};

$('#root').atomMount(UserProfile, { id: 42 });
```

---

## Web Components

### `$.useAtomComponent(element)`

Integrates reactive state management into standard Custom Elements. This utility returns an `AtomComponentController` that handles the initialization and cleanup of reactive resources synchronized with the component's lifecycle.

> **DX Diagnostic**: In debug mode (`$.debug.enabled = true`), this utility warns if the host element's tag name is a custom element (contains a hyphen) but has not been registered via `customElements.define()`.

#### Controller API

- **`attrs`**: A factory function that returns `WritableAtom`s for HTML attributes. Calling the function with an attribute name (e.g., `attrs('theme')`) returns a lens atom. Changing an atom updates the corresponding DOM attribute, and attribute changes update the atom value. If the component class declares `static observedAttributes`, only those attributes are tracked in the reactive snapshot.
- **`slots`**: A factory function providing `ReadonlyAtom<Node[]>` for each Shadow DOM `<slot>`. Fully supports Closed Shadow DOM when the root is passed to `setup()`.
  - `controller.slots('default')`: Tracks nodes in the unnamed slot.
  - `controller.slots(name)`: Tracks nodes in a named slot (e.g., `controller.slots('header')`).
- **`$`**: A jQuery selector (`JQueryScopedSelector`) scoped to the component's `ShadowRoot` or the host element itself.

#### `setup(options?)`

Configures reactive observers, event dispatching, and data binding.

- **`shadowRoot`**: The `ShadowRoot` instance used for scoped selectors and slot tracking (required for 'closed' mode).
- **`dispatch`**: An object mapping event names to atoms or functions. A `CustomEvent` is automatically dispatched from the host whenever the state changes.
- **`bind`**: An object mapping keys to atoms. Elements within the component containing `data-bind="key"` will have their text content updated when the atom changes.

#### Example: Reactive Custom Element

```javascript
class MyComp extends HTMLElement {
  static observedAttributes = ['theme'];
  private aej = $.useAtomComponent(this);
  private count = $.atom(0);
  
  connectedCallback() {
    const sr = this.attachShadow({ mode: 'open' });
    sr.innerHTML = `
      <div>
        <h1 data-bind="title"></h1>
        <slot></slot>
        <button class="inc">Increment</button>
      </div>
    `;

    this.aej.setup({
      shadowRoot: sr,
      bind: { title: $.computed(() => `Theme: ${this.aej.attrs('theme').value}`) },
      dispatch: { 'count-changed': this.count }
    });

    this.aej.$('.inc').on('click', () => this.count.value++);
  }
  
  disconnectedCallback() {
    this.aej.teardown();
  }
}
customElements.define('my-comp', MyComp);
```

---

## Dependency Injection

### `$.provideAtom<T>(target, key, atom)`

Exposes a reactive value to all descendant elements in the DOM tree.

- **Shadow DOM Support**: Uses event-based discovery to allow state to cross Shadow DOM boundaries via the `aej:context-request` event.
- **CSS Synchronization**: Automatically mirrors the provided value to a CSS custom property (`--aej-[key]`) on the provider element, enabling state-driven styling.

### `$.injectAtom<T>(target, key)`

Retrieves a reactive value provided by an ancestor element.

- **Dynamic Resolution**: Returns a proxy that maintains the connection even if the element is moved to a different position in the DOM hierarchy.
- **Lazy Connection**: Supports disconnected elements by deferring the provider search until the element is attached to the document.
- **Performance**: Utilizes an internal versioning system to minimize re-discovery overhead during structural DOM changes.
- **DX Warning**: In debug mode, warns if the target element is an unregistered custom element.

---

## Static Methods

### `$.atomLens(atom, path)`

Creates a two-way reactive lens for a specific property path on an object-based atom.

- **Returns**: A `WritableAtom` that updates the parent atom using structural sharing. Includes compile-time path validation.

```javascript
const nameLens = $.atomLens(store, 'user.profile.name');
$('#name-input').atomVal(nameLens);
```

### `$.batch(fn)`

Groups multiple atom writes into a single synchronous notification cycle.

### `$.untracked(fn)`

Executes a function without establishing reactive dependencies.

### `$.nextTick()`

Returns a `Promise` that resolves after the next scheduler flush, waiting for all pending reactive effects.

---

## Data Fetching

### `$.atomFetch(urlOrFn, options)`

AJAX primitive that wraps `$.ajax` with reactive capabilities.

- **Concurrency**: Aborts previous requests using `AbortController` when dependencies change.
- **Normalization**: Standardizes `jqXHR` objects into native `Error` instances.
- **Integration**: Re-fetches automatically if parameters depend on other atoms.

```javascript
const user = $.atomFetch(() => `/api/users/${userId.value}`, {
  defaultValue: null,
});

$('#name').atomText(user, u => u?.name ?? '');
```

---

## Routing

### `$.route(config)`

SPA router supporting hash-based and pushState routing. Includes features for dynamic segments, template cloning, and implicit auto-discovery of routes from the DOM.

> **DX Diagnostic**: In debug mode, the router automatically scans rendered content for unregistered custom elements and logs warnings to prevent silent failures during view transitions.

---

## PJAX Navigation

### `$.atomNav(options)`

Navigation module (PJAX) that intercepts link clicks, fetches content asynchronously, and updates target containers while maintaining browser history.

---

## Debug Mode

### Visual Feedback

When enabled via `$.debug.enabled`:

- **Console Logs**: Logs DOM updates with selectors.
- **Visual Highlighting**: Updated elements are outlined with a red border using a `requestAnimationFrame` loop.
- **Precision**: Logs use a `tag#id.class` format for identification.
