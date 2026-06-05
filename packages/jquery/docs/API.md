# jQuery Integration API

This package extends jQuery with reactive capabilities. All methods are available on jQuery collections (`$(selector).method()`).

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

When accessed via a CDN (e.g., jsDelivr or unpkg), the library exposes the global `AtomEffectJQuery` namespace.

### Global Namespace

The following utilities and constants are available on the global `AtomEffectJQuery` object:

- `initAEJ(config)`: Unified entry point for library configuration (patches, auto-cleanup).
- `enableAutoCleanup(container)`: Attaches a MutationObserver to a specific element for automated resource disposal.
- `disableAutoCleanup()`: Removes all global observers.
- `enablejQueryOverrides(options)`: Enables patches for native jQuery methods (e.g., `.remove()`, `.empty()`).
- `nextTick()`: Utility for waiting until the next reactive flush.
- `cleanup(element)`: Triggers a recursive teardown of reactive resources on an element and its Shadow DOM.
- `debug`: Access to the runtime diagnostic controller.

### Library Configuration (`$.initAEJ`)

The library auto-initializes on `document.body` by default. You can use `$.initAEJ` to configure behavior or target specific container roots:

```javascript
// Example: Customize patches and target a specific container
$.initAEJ({
  patch: { lifecycle: true, events: false },
  autoCleanup: { root: myContainer }
});

// Example: Manual mode (disable automated features)
$.initAEJ({ patch: false, autoCleanup: false });
```

> **Note**: Subsequent calls to `initAEJ` replace the existing configuration.

### Extending jQuery

The library extends the global `jQuery` (or `$`) object. Methods like `$.atom()`, `$.computed()`, and `.atom*()` instance methods become available upon script evaluation.

---

## Unified Binding

### `.atomBind(bindings)`

A centralized method for applying multiple bindings concurrently. It utilizes a task-based loop strategy to manage DOM updates efficiently.

```javascript
$('.user-card').atomBind({
  text: nameAtom,                 // Binds textContent (atom or static value)
  html: bioAtom,                  // Binds sanitized innerHTML
  class: { 'active': isActive },  // Toggles CSS class
  css: { 'color': colorAtom },    // Inline style property
  attr: { 'data-id': idAtom },    // HTML attribute
  prop: { 'disabled': isDisabled },// DOM property
  show: isVisible,                // Toggles display (show/hide)
  hide: isHidden,                 // Inverse of show
  val: inputAtom,                 // Two-way binding for form inputs
  checked: isChecked,             // Two-way binding for checkboxes/radios
  form: userAtom,                 // Automated form synchronization
  on: { click: handleClick }      // Event handler
});
```

---

## Content & Attributes

### `.atomText(atom, formatter?)`

Updates `textContent`. Supports `AsyncReactiveValue` (direct Promise or atom yielding Promise).

- **formatter**: Optional function `(val) => string`.
- **Tuple Support**: When used inside `.atomBind()`, can be expressed as a tuple `text: [source, formatter]`.

```javascript
$('#price').atomText(price, p => `$${p.toFixed(2)}`);

// Using atomBind
$el.atomBind({ text: [count, c => `Count: ${c}`] });
```

### `.atomHtml(atom)`

Updates `innerHTML`.

> **Security Implementation**:
> This method utilizes an internal sanitization engine (`sanitizeHtml`) to mitigate DOM Clobbering and XSS vulnerabilities:
>
> 1. **Inert Parsing**: Data is parsed within an inert `<template>` to prevent execution during construction.
> 2. **Multi-pass Normalization**: Double-decodes HTML entities and strips control characters.
> 3. **Structural Neutralization**: Transforms untrusted tags (e.g., `<script>`, `<iframe>`) into safe `<span>` wrappers.
> 4. **Priority Defense Rules**: Strips inline event handlers, blocks protocol-based URI sinks (e.g., `javascript:`), and filters dangerous CSS.
> 5. **Prototype Hardening**: DOM property access is routed through prototype-bound methods to mitigate DOM Clobbering.
>
> For extensive sanitization requirements, integrating a dedicated library like DOMPurify is supported via computed atoms:
>
> ```javascript
> import DOMPurify from 'dompurify';
>
> const safeContent = $.computed(() => DOMPurify.sanitize(rawHtml.value));
> $('#container').atomHtml(safeContent);
> ```

### `.atomClass(className, atom)` or `.atomClass(classMap)`

Toggles CSS classes based on truthiness. Supports multiple space-separated classes.

- **Class Deduplication**: A specific class remains applied if any of its associated reactive conditions are true.

```javascript
$('#btn').atomClass('disabled', isLoading);
$el.atomClass({ 'active highlight': atom1, 'active large': atom2 });
```

### `.atomCss(property, atom, unit?)` or `.atomCss(propertyMap)`

Updates inline CSS properties. An optional `unit` string (e.g., `'px'`) can be appended.

```javascript
$('.box').atomCss('opacity', opacityLevel);
$('.box').atomCss('width', widthAtom, 'px');
```

### `.atomAttr(attribute, atom)` or `.atomAttr(attributeMap)`

Updates HTML and SVG attributes.

- **Security**: Blocks `on*` event handlers and protocol-based payloads.
- **Boolean Attributes**: Removed entirely when the condition evaluates to `false`.
- **WAI-ARIA**: Boolean values are coerced to `"true"` or `"false"` strings for screen reader compatibility.

```javascript
$('img').atomAttr('src', imageUrl);
```

### `.atomProp(property, atom)` or `.atomProp(propertyMap)`

Updates DOM object properties directly.

- **Security**: Blocks access to structural properties (`innerHTML`, `outerHTML`) and prototype vectors (`__proto__`, `constructor`, `prototype`).

```javascript
$('input').atomProp('disabled', shouldDisable);
```

---

## Control Flow

### `.atomShow(atom)` / `.atomHide(atom)`

Toggles element visibility.

- **Layout Preservation**: Captures and restores the element's original `display` value (e.g., `flex`, `grid`) when transitioning from `none`.

```javascript
$('.loading-spinner').atomShow(isLoading);
```

### `.atomList(listAtom, options)`

Renders and reconciles a list of DOM elements against an array.

#### Options

- **`key`**: `keyof T | (item, index) => string | number` (Required) — Function or property name returning a unique identifier.
- **`render`**: `(item, index) => string | Element | DocumentFragment | JQuery` — Template generator for new items.
- **`bind`**: `($el, item, index) => void` — Applies reactive bindings to newly rendered elements.
- **`update`**: `($el, item, index) => void` — Manual reconciliation logic for existing elements.
- **`onAdd`** / **`onRemove`**: Lifecycle hooks. `onRemove` supports asynchronous execution for exit animations.
- **`isEqual`**: `(a, b) => boolean` — Custom equality check for item comparisons.
- **`events`**: Delegated event handlers applied to the list container.

```javascript
$('ul').atomList(usersAtom, {
  key: u => u.id,
  render: u => `<li class="user-item"></li>`,
  bind: ($el, user) => {
    $el.atomText(user.name);
  }
});
```

#### Reconciliation Implementation

The `atomList` engine utilizes a 3-pass reconciliation pipeline:

1. **Head/Tail Fast-forwarding**: Identifies stable elements at the start and end of the list.
2. **Middle-range Diffing**: Processes insertions, deletions, and moves.
3. **Greedy Placement**: Optimizes DOM insertion operations.

---

## Form Bindings

### `.atomVal(atom, options?)`

Two-way synchronization for `<input>`, `<textarea>`, and `<select>`. Natively supports `<select multiple>` via `string[]`.

**Implementation Details**:

- **Strategy Specialization**: Resolves read/write strategies during initialization to ensure monomorphic execution paths.
- **IME Stability**: Monitors composition states (e.g., CJK input) to prevent external state changes from interrupting character entry.
- **Cursor Preservation**: Maintains selection ranges and focus during updates.

**Options**:

- `debounce`: number (ms) — Delays updates to the atom.
- `format` / `parse`: Transformation functions applied between the atom and the DOM.
- `equal`: Custom equality check to prevent redundant updates.

```javascript
$('#search').atomVal(queryAtom, { debounce: 300 });
```

### `.atomChecked(atom)`

Two-way synchronization for checkbox and radio inputs.

- **Radio Groups**: Synchronizes all radio inputs sharing the same `name` attribute. Internally utilizes a memory-safe `WeakMap` cache of active elements to skip global DOM query scans (`$(document).find`) and achieve O(1) synchronization lookups.

```javascript
$('#agree').atomChecked(isAgreedAtom);
```

### `.atomForm(atom | atom[], options?)`

Automated two-way synchronization for forms, mapping inputs to atom properties via their `name` attributes.

- **Multi-Atom Support**: Accepts an array of atoms (merged via `mergeLenses`). Later atoms take precedence on overlapping keys.
- **Nested Paths**: Resolves dot-notation paths (e.g., `user.profile.name`).
- **Dynamic DOM**: Uses `MutationObserver` to detect and bind inputs added after initialization.
- **Validation**: Integrates with the native Constraint Validation API via `setCustomValidity`.

```javascript
const user = $.atom({ name: 'Alice', age: 30 });

$('form').atomForm(user, {
  debounce: 200,
  transform: (path, val) => (path === 'age' ? Number(val) : val),
  validation: {
    'name': (v) => (v ? '' : 'Name is required'),
    'age': (v) => (v >= 18 ? true : 'Must be an adult')
  }
});
```

### `.atomOn(event, handler)`

Lifecycle-aware event delegation. Handlers are executed within a `batch()` cycle and are automatically unbound during teardown.

```javascript
$('#btn').atomOn('click', () => doSomething());
```

---

## Components

### `.atomMount(component, props?)`

Mounts a functional component structure to the selected elements.

- **Batching**: Executes within a `batch()` cycle.
- **Isolation**: Runs within an `untracked()` scope to prevent unintentional subscription to parent reactive contexts.

```javascript
const UserProfile = ($el, { id }) => {
  const data = $.atomFetch(`/api/user/${id}`, { defaultValue: {} });
  $el.atomText($.computed(() => data.value.name));

  return () => console.log('Cleanup execution');
};

$('#root').atomMount(UserProfile, { id: 42 });
```

---

## Web Components

### `$.useAtomComponent(element)`

Integrates the reactive engine into standard Custom Elements, returning an `AtomComponentController` for lifecycle and state synchronization.

> **Diagnostic**: In debug mode, the utility warns if the host element contains a hyphen but is not registered via `customElements.define()`.

#### Declarative Configuration

Custom Elements can configure reactivity via static properties.

| Property | Type | Description |
| :--- | :--- | :--- |
| `aejStyles` | `(string \| CSSStyleSheet)[]` | Array of styles applied via `adoptedStyleSheets`. |
| `aejBind` | `Record<string, ReadonlyAtom<any>>` | Text bindings targeting `data-aej-bind` attributes. |
| `aejAria` | `Record<string, ReadonlyAtom<any>>` | Reactive ARIA synchronization via `ElementInternals`. |
| `aejParts` | `Record<string, ReadonlyAtom<any>>` | Reactive CSS Shadow Parts control. |
| `aejDispatch` | `Record<string, ReactiveValue<any>>` | Automatic `CustomEvent` dispatching on state changes. |
| `aejValue` | `Atom<any> \| { val: Atom, state?: Atom }` | Form-Associated Custom Element (FACE) data synchronization. |
| `aejValidation` | `Atom<ValidityStateFlags \| string> \| Function` | Native Constraint Validation API integration. |

#### Controller API

- **`host`**: The raw host element of the component.
- **`root`**: The active root node (`ShadowRoot` or Host container).
- **`attrs(name: string)`**: Returns a Lens Atom targeting a specific attribute. Respects `static observedAttributes` if defined.
- **`slots(name?: string)`**: Returns a `ReadonlyAtom<Node[]>` representing the assigned nodes of a Shadow DOM `<slot>`.
- **`internals`**: Provides access to the `ElementInternals` object.
- **`$(selector)`**: A scoped jQuery selector isolated to the component's `ShadowRoot` or host container.
- **`teardown()`**: Releases all reactive resources and disposes of internal states.
- **`setup(options?)`**: Bootstraps the reactive features based on the provided configuration or static specs.

#### `setup(options?)`

Bootstraps the reactive features based on the provided configuration or the static specs defined on the element class.

```javascript
class MyComp extends HTMLElement {
  static aejStyles = [':host { display: block; }'];
  static aejBind = { title: $.atom('Hello World') };

  private aej = $.useAtomComponent(this); 
  
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <h1 data-aej-bind="title"></h1>
    `;
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

Registers a reactive value for consumption by descendant elements.

- **Shadow DOM**: Traverses Shadow DOM boundaries using the `aej:context-request` event protocol.
- **CSS Synchronization**: Exposes the value as a CSS custom property (`--aej-[key]`) on the provider.

### `$.injectAtom<T>(target, key)`

Retrieves a value registered by an ancestor via `provideAtom`.

- **Dynamic Resolution**: Maintains connection mapping if elements are relocated within the DOM hierarchy.
- **Lazy Initialization**: Defers provider lookup if the requesting element is disconnected from the document.

---

## Static Methods

### `$.atomLens(atom, path)`

Creates a two-way reactive lens addressing a specific nested property path. Supports structural sharing.

### `$.mergeAtoms(...atoms)`

Combines object-based atoms into a read-only computed atom with a flattened type structure.

### `$.mergeLenses(...lenses)`

Unifies writable lenses. Setting the unified value propagates changes back to the respective source lenses.

### `$.isAtom(val)` / `$.isComputed(val)` / `$.isEffect(val)`

Runtime type guards for reactive primitives.

### `$.isPromise(val)`

Identifies `Promise` or thenable objects.

### `$.batch(fn)`

Executes a callback, deferring all reactive notifications until the callback completes.

### `$.untracked(fn)`

Executes a callback without registering reactive dependencies.

### `$.nextTick()`

Returns a `Promise` resolving after the next reactive scheduler flush cycle.

---

## Data Fetching

### `$.atomFetch(urlOrFn, options)`

A reactive wrapper for AJAX requests.

- **Concurrency**: Integrates `AbortController` to cancel pending requests when dependencies update.
- **Normalization**: Standardizes `jqXHR` objects into native `Error` classes.

```javascript
const user = $.atomFetch(() => `/api/users/${userId.value}`, {
  defaultValue: null,
});
```

---

## Routing

### `$.route(config)`

A Single Page Application router supporting both HTML5 History and Hash modes.

- **Pattern Matching**: Leverages the native `URLPattern` API for segment extraction, falling back to Regex when unsupported.
- **Route Lifecycle**: Provides `onEnter` and `onLeave` hooks for navigation guards.

---

## PJAX Navigation

### `$.atomNav(options)`

A PJAX-style navigation manager that intercepts link clicks to fetch and swap HTML fragments asynchronously without full page reloads.

- **Request Coordination**: Utilizes `X-PJAX-Container` headers and `AbortSignal` cancellation to manage network concurrency ("last navigation wins").
- **DOM Reconciliation**: Performs resource cleanup on existing DOM nodes before injecting new content to prevent memory leaks.
- **Scroll Management**: Determines scrolling behavior (e.g., `#hash` targeting or resetting to top) based on the URL transition type.
- **Metadata**: Automatically synchronizes the document `<title>` and `<meta>` tags from the fetched response.

```javascript
const nav = $.atomNav({
  target: '#main-content',
  selector: '#main-content',
  onMount: ($container, url) => console.log(`Navigated to ${url}`)
});
```

---

## Debug Mode

### Visual Feedback

When enabled via `$.debug.enabled = true`:

- **Console Diagnostics**: Logs node updates and specific DOM operations.
- **Visual Highlighting**: Outlines updated elements using `requestAnimationFrame` for performance profiling. Style checks are throttled to 1000ms intervals to eliminate profiling overhead during high-frequency sequential updates.
- **Precision**: Logs structural paths utilizing the `tag#id.class` format.
