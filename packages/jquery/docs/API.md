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
- `enableAutoCleanup(container)`: Manually attach a MutationObserver to a specific element.
- `disableAutoCleanup()`: Remove all global observers.
- `enablejQueryOverrides(options)`: Manually enable patches for jQuery's native methods.
- `nextTick()`: Utility for waiting until the next reactive flush.
- `registry`: Access to the internal element-effect registry.
- `debug`: Access to the runtime-toggleable debug controller.

### Library Configuration (`$.initAEJ`)

While the library auto-initializes on `document.body` by default, you can use `$.initAEJ` to fine-tune its behavior or target specific roots:

```javascript
// Example: Customize patches and target a specific container
$.initAEJ({
  patch: { lifecycle: true, events: false },
  autoCleanup: { root: myContainer }
});

// Example: Fully manual mode (disable all auto features)
$.initAEJ({ patch: false, autoCleanup: false });
```

> **Note**: Subsequent calls to `initAEJ` will replace the existing configuration.

### Extending jQuery

The library automatically extends the global `jQuery` (or `$`) object. Methods like `$.atom()`, `$.computed()`, and all `.atom*()` chainable methods will be available as soon as the script is loaded.

---

## Unified Binding

### `.atomBind(bindings)`

The preferred way to apply multiple bindings at once. This method uses a **task-based loop strategy** to minimize overhead, ensuring efficient invocation even for complex binding maps by pre-filtering active tasks before iterating over elements.

```javascript
$('.user-card').atomBind({
  text: nameAtom,                 // Binds textContent (any reactive source or Promise)
  html: bioAtom,                  // Binds sanitized innerHTML (yields or is string|Promise)
  class: { 'active': isActive },  // Toggles class (yields or is boolean|Promise)
  css: { 'color': colorAtom },    // Style property (yields or is string|number|Promise)
  attr: { 'data-id': idAtom },    // Attribute (yielding PrimitiveValue|Promise)
  prop: { 'disabled': isDisabled },// DOM property (yielding unknown|Promise)
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
- **Integrated Binding Support**: When used via `.atomBind()`, can be expressed as a tuple `text: [source, formatter]`. This now fully supports **static values** (e.g., `text: ['Hello', h => h + '!']`).

```javascript
$('#price').atomText(price, p => `$${p.toFixed(2)}`);
// Via atomBind (supports static values and atoms)
$el.atomBind({ text: [count, c => `Count: ${c}`] });
```

### `.atomHtml(atom)`

Updates `innerHTML`.

> **🛡️ Security Note**:
> This method uses a **multi-layered DOM-based Sanitizer** (via inert `<template>`) for maximum reliability. It uses a **recursive tree-walker** that transforms dangerous tags (`<script>`, `<iframe>`, etc.) into inert `<span>` wrappers while stripping `on*` attributes and dangerous protocols (`javascript:`, `data:`, etc.).
>
> **Key Security Features**:
>
> - **DOM Clobbering Protection**: Uses prototype-level descriptors to prevent malicious inputs from shadowing internal element properties.
> - **Immediate Scrubbing**: All attributes from transformed nodes (e.g., `<script onerror=...>` → `<span data-unsafe-attr=...>`) are immediately processed.
> - **Recursive Trust**: Automatically cleanses nested contexts including `<template>` content and `srcdoc` sinks.
>
> While highly efficient, [DOMPurify](https://github.com/cure53/DOMPurify) is recommended for complex, user-generated content to ensure maximum security.
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

- **Security Guards**: Automatically blocks `on*` event handlers and dangerous protocols (`javascript:`, `vbscript:`, etc.) to prevent injection. This protection extends to SVG attributes like `fill`, `filter`, and `mask` which may contain `url(javascript:...)` patterns.
- **HTML Sinks**: Specifically monitors and sanitizes dangerous HTML sinks like `srcdoc`.
- **Constraints**: Accepts `PrimitiveValue` (string, number, boolean, null, undefined).
- **WAI-ARIA**: Boolean `false` is preserved as the string `"false"` for `aria-*` attributes (e.g., `aria-expanded="false"`), not removed. Other attributes treat `false` as removal.

```javascript
$('img').atomAttr('src', imageUrl);
```

### `.atomProp(property, atom)`

Updates a DOM property (e.g., `checked`, `disabled`, `value`).

- **Flexible**: Employs `unknown` instead of `any` to satisfy strict linting while maintaining 100% flexibility for heterogeneous property types.
- **Security**: Directly blocks dangerous properties (`innerHTML`, `outerHTML`, `srcdoc`) and prototype pollution vectors (`__proto__`, `constructor`, `prototype`) through a unified security subsystem.

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

The `atomList` synchronization engine uses a **greedy placement strategy** combined with native DOM APIs (`insertBefore`, `appendChild`) for structural updates. This bypasses jQuery's internal overhead (script scanning, context normalization) during the rendering hot path, ensuring O(N) performance even for lists with thousands of items.

#### Memory & Async Safety

All reactive bindings (`atomBind`, `atomText`, etc.) include built-in **Zombie Prevention**. This ensures that asynchronous updates (promises) are automatically discarded if the element is disconnected from the DOM before the resolution completes. Additionally, the library ensures zero memory leaks even in highly dynamic states through its internal registry. `atomBind` (via `registerMapEffect`) also optimizes multi-promise maps by synchronizing multiple asynchronous dependencies, preventing partial updates and flickering during complex state transitions.

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

- **Deep Paths**: Supports dot-notation and array access in `name` attributes (e.g., `name="user.profile.name"`, `name="items[0].text"`) to bind to nested object properties using `atomLens`.
- **Dynamic DOM**: Automatically detects and binds new form controls added to the DOM after the initial call using `MutationObserver`. Also handles field renaming and removal (via ref-counting).
- **Radio & Checkbox Groups**: Native support for radio groups and checkbox groups. Checks are automatically mapped to boolean, string, or array values based on input type and name collision.
- **Data-Driven Sync**: Prioritizes core `atomLens` data structures over complex dual-sync algorithms. This naturally prevents infinite feedback loops and ensures that "leaf" updates (DOM) and "root" updates (Atom) remain perfectly synchronized with zero redundant propagation.
- **Performance**: Leverages the optimized lens recursive update engine, ensuring typing performance remains constant for O(1) leaf updates even in massive, deeply nested forms.

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

- **component**: `($element, props) => EffectResult` (Function returning an optional teardown).
  - **EffectResult**: Can be `undefined`, a single cleanup function, or a `ComponentLifecycle` object containing an `unmount()` method.
- **props**: Optional initial data object.

```javascript
const UserProfile = ($el, { id }) => {
  const data = $.atomFetch(`/api/user/${id}`, { defaultValue: {} });
  $el.atomText($.computed(() => data.value.name));

  return () => console.log('Cleaning up user profile...');
};

$('#root').atomMount(UserProfile, { id: 42 });
```

---

## Web Components

### `$.useAtomComponent(element)`

Composition-based helper for adding AEJ reactive features to standard Web Components (Custom Elements). It returns a controller to manage the component's reactive lifecycle.

**Parameters**:

- `element`: `HTMLElement` (usually `this` inside a class).

**Returns**: `AtomComponentController` object with:

- `host`: The raw `HTMLElement` (usually `this`).
- `root`: The active root node (ShadowRoot or Host). Available after `setup()`.
- `$`: Scoped jQuery selector. Limited to selecting elements within the component.
- `setup(shadowRoot?)`: Initializes reactive lifecycle. Pass `shadowRoot` for closed-mode components.
- `teardown()`: Disposes all bindings. Call in `disconnectedCallback`.
- `provideAtom(key, val)`: Scoped provider registration.
- `injectAtom(key)`: Scoped context injection.

```javascript
class MyComp extends HTMLElement {
  private aej = $.useAtomComponent(this);
  
  connectedCallback() {
    this.aej.setup();
    this.aej.$('.title').atomText($.atom('Hello'));
  }
  
  disconnectedCallback() {
    this.aej.teardown();
  }
}
```

---

## Dependency Injection

### `$.provideAtom(target, key, atom)`

Registers an element as a provider for a reactive context.

- **target**: `string | HTMLElement | JQuery` — The provider element(s).
- **key**: `string | symbol` — Unique identifier.
- **atom**: The value to share.

### `$.injectAtom(target, key)`

Injects a reactive context provided by an ancestor.

- **target**: `string | HTMLElement | JQuery` — The requesting element.
- **key**: `string | symbol` — The identifier to find.

**Returns**: A `ReadonlyAtom<T>` wrapping the provided value, or `null` if no provider is found.

#### Reactive Resolution

Unlike standard DI, `injectAtom` returns a **reactive source**. If the provider changes the value at runtime, any effects or bindings using the injected atom will automatically update.

#### Late Binding (Custom Elements)

Custom Elements often need to inject atoms during construction or before they are connected to the DOM. AEJ supports **Late Binding**: if `injectAtom` is called on a disconnected Custom Element, it returns a lazy computed atom that will resolve the context once the element is attached.

```javascript
class MyComp extends HTMLElement {
  // Safe: Returns a lazy atom that resolves when connected
  private theme = $.injectAtom(this, 'theme');

  connectedCallback() {
    this.aej.setup();
    // Use the atom normally
    this.aej.$('.title').atomClass('dark', $.computed(() => this.theme.value === 'dark'));
  }
}
```

#### Type Safety (Generics)

`injectAtom` supports generics, allowing you to explicitly specify the type of the injected data.

```typescript
// Inject the atom corresponding to the 'user-theme' key as type 'light' | 'dark'
const theme = $.injectAtom<'light' | 'dark'>(el, 'user-theme');
// 'theme' will be of type ReadonlyAtom<'light' | 'dark'> | null.
```

#### Shadow DOM Traversal

AEJ's DI system uses a **composed tree traversal** strategy (O(depth)). It automatically traverses Shadow DOM boundaries by walking up the host chain until a provider is found or the document root is reached. This is more reliable and performant than event-based DI, as it doesn't depend on event bubbling or retargeting rules.

### `.atomUnmount()`

Disposes all reactive bindings and component cleanups on the selected elements and their descendants. This method is the primary way to manually teardown a component tree from the DOM.

### `.atomUnbind()`

Manually disposes all reactive effects and cleanups registered on the selected elements and their descendants. Does not invoke the component cleanup function — use `.atomUnmount()` for full component teardown. Supports recursive traversal across `DocumentFragment` and `ShadowRoot`.

> **💡 Note**: You generally do not need to call `.atomUnbind()` manually. The library heavily leverages `MutationObserver` to automatically perform memory cleanup when elements are removed from the DOM.
>
> If you need to change the root of the automatic cleanup (e.g., to a specific ShadowRoot), use `$.initAEJ({ autoCleanup: { root: myRoot } })`.

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

### `$.isAtom(v)`, `$.isComputed(v)`

Runtime type checks for reactive nodes.

```javascript
$.isAtom(myAtom);      // true
$.isComputed(myComp);  // true
```

### `$.nextTick()`

Returns a `Promise` that resolves after the next scheduler flush. Unlike a generic `Promise.resolve()`, this uses the core `aeNextTick()` implementation, ensuring it waits for all pending reactive effects and benefits from internal promise deduplication for better performance and lower allocation overhead.

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

- **Concurrency Management**: Automatically aborts previous requests using `AbortController` when dependencies change or the atom is disposed. Cancellations are silent and do **not** trigger error states.
- **Error Normalization**: Standardizes `jqXHR` objects into native `Error` instances, providing reliable `status 0` (timeout/network) handling and descriptive messages.
- **Reactive Integration**: Re-fetches automatically if parameters depend on other atoms.

**Parameters**:

- `urlOrFn`: `string | () => string` — Static URL or a function that reads atoms.
- `options`: `FetchOptions<T>`
  - `defaultValue`: `T` (Required) — Value before first response.
  - `name`: `string` (Optional) — Debug name for the atom.
  - `method`: `string` — HTTP method.
  - `headers`: `Record<string, string>` — Request headers.
  - `transform`: `(raw: unknown, xhr: JQuery.jqXHR) => T` — Response transformer.
  - `ajaxOptions`: `JQuery.AjaxSettings | () => JQuery.AjaxSettings` — Full passthrough. When provided as a function, its atom dependencies are tracked.

**Priority Order**: Settings are merged in the order: `Direct Options > Dynamic Options (ajaxOptions function) > Static Options (ajaxOptions object)`. For example, a top-level `method` override always wins.

**Returns**: `ComputedAtom<T>` — reactive value with:

- `.value` — Resolved data (or `defaultValue` while pending).
- `.isPending` — `true` during fetch.
- `.hasError` / `.lastError` — Error state.
- `.abort()` — Cancels the current pending request.
- `.invalidate()` — Triggers refetch.

**Additional Options**:

- `onError`: `(err: Error) => void` — Called on failure. Exceptions thrown inside this hook are caught and logged to prevent breaking the reactive chain.
- `eager`: `boolean` — If `false`, the first fetch is deferred. Default: `true`.

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

- `target`: `string | JQuery | HTMLElement` — Selector or element where routes will be rendered. Supporting object references allows initializing routers inside dynamic layouts or `atomNav` containers.
- `default`: Name of the default route to load if the URL is empty.
- `routes`: (Optional) Object mapping route names to unified `RouteDefinition` objects. If omitted, the router will attempt **Implicit Auto-Discovery**.
  - Supports **Dynamic Segments**: Use `:paramName` (e.g., `'user/:id'`). Parameters are automatically extracted and available in the `params` atom.
  - `template`: Selector for a `<template>` element to clone.
  - `render`: Custom function `(container, name, params, onUnmount, router) => void`.
    - `onUnmount`: Callback `(cleanupFn) => void` to register side-effect cleanups for the route.
  - `onEnter`: Hook called before rendering. Can return an object to merge into `params`, or `false` to block navigation.
  - `onLeave`: Hook called before navigating away. Return `false` to block.
  - `onMount`: `($content: JQuery, onUnmount, router) => void` — Called after the route content (both template and rendered) is appended.
  - `title`: (Optional) String to set as `document.title` when this route is active.
- `mode`: (Optional) `'hash'` (default) or `'history'`.
- `basePath`: (Optional) Base path prefix for history mode (e.g., `'/app'`).
- `notFound`: (Optional) Route name to use when no match is found.
- `autoBindLinks`: (Optional) If `true`, automatically handles clicks on `[data-route]` links.
- `activeClass`: (Optional) CSS class for active links (default: `'active'`).
- `beforeTransition`: (Optional) Global hook `(from, to) => void`.
- `afterTransition`: (Optional) Global hook `(from, to) => void`.

### Nav & Router Synergy (Traffic Control)

`$.atomNav` and `$.route` are designed to work together in hybrid applications. You can use `atomNav` for top-level layout transitions (PJAX) and `$.route` for sub-view management within those layouts.

- **Selector Isolation**: Use the `selector` option in `atomNav` (e.g., `a[data-nav]`) to ensure it only intercepts layout-level links, while `$.route` handles `[data-route]` links.
- **Base Path Isolation**: Use `basePath` in `$.route` (History mode) to restrict the SPA router to a specific URL sub-tree, allowing `atomNav` to handle the rest of the site.
- **Automatic Cleanup**: When `atomNav` replaces a container, any `$.route` instance initialized inside that container is automatically destroyed via the `registry`'s `MutationObserver`.

#### Implicit Auto-Discovery

If the `routes` configuration is omitted, the router scans the DOM for `<template data-path="..." data-default>` elements.

```html
<template data-path="home" data-default><!-- content --></template>
<template data-path="user/:id"><!-- content --></template>
```

**Returns**:

A `Router` object with:

- `currentRoute`: `ReadonlyAtom<string>` containing the active route name (pattern).
- `queryParams`: `ReadonlyAtom<Record<string, string>>` reactive map of URL query parameters.
- `params`: `ReadonlyAtom<Record<string, string>>` merged reactive map of path parameters and query parameters.
- `navigate(route)`: Programmatically change route. Supports dynamic paths (e.g., `navigate('user/42')`) and query strings.
- `destroy()`: Cleanup listeners, effects, and active subscriptions.

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
    'user/:id': {
      render: (el, route, params, onUnmount) => {
        // params.id is reactively extracted from the URL
        const id = $.computed(() => params.id);
        $(el).atomText(id, val => `User ID: ${val}`);
      }
    }
  }
});

// Navigate to a dynamic route
router.navigate('user/42');
```

---

## PJAX Navigation

### `$.atomNav(options)`

A state-driven lightweight navigation module (PJAX) for jQuery. It intercepts link clicks, fetches content asynchronously, and updates a target container while maintaining browser history.

**Options**:

- `target`: `string | JQuery | HTMLElement` (Required) — Selector or element where content will be injected.
- `selector`: `string` (Optional) — Selector for links to intercept. Defaults to `'a[data-nav]'`.
- `headers`: `Record<string, string>` (Optional) — Custom headers (e.g., `X-PJAX: true` is sent by default).
- `onBeforeLoad`: `(url) => boolean | Promise<boolean>` (Optional) — Return `false` to cancel navigation.
- `onMount`: `($container, url) => void` (Optional) — Called after content is injected.
- `onUnmount`: `($container, oldUrl) => void` (Optional) — Called before content is replaced.
- `onError`: `(err, url) => boolean | undefined | void` (Optional) — Callback triggered when a navigation error occurs. Return `false` to prevent default fallback to full page load.
- `scrollToTop`: `boolean` (Optional) — Whether to scroll to top on nav. Defaults to `true`.
- `syncTitle`: `boolean` (Optional) — Whether to sync `document.title` from response `<title>` tags. Defaults to `true`.

**Returns**: `AtomNav` object:

- `currentUrl`: `ReadonlyAtom<string>` — Reactive current URL.
- `isPending`: `ReadonlyAtom<boolean>` — Loading state (includes network and `onBeforeLoad` hook duration).
- `hasError`: `ReadonlyAtom<boolean>` — Error state.
- `navigate(url, options?)`: Programmatically navigate. Defaults to a `pushState` history entry. Pass `{ replace: true }` to use `replaceState`.
  - **Optimization**: Navigating to the exact same location (same path and hash) is ignored to prevent redundant network requests and hook freezes, unless `replace` is requested.
  - **Hash Transitions**: Internal hash transitions without path changes bypass AJAX hooks and trigger native scrolling immediately.
  - Returns a `Promise<void>` that resolves when navigation/hydration is complete.
- `destroy()`: Cleanup listeners, abort pending requests, and dispose atoms.

```javascript
const nav = $.atomNav({
  target: '#main-content',
  onMount: ($el) => $el.hide().fadeIn(300)
});

// React to navigation state globally
$.effect(() => {
  $('#loader').toggle(nav.isPending.value);
});
```

---

## Debug Mode

The library includes a built-in debug mode to help you visualize reactive updates and troubleshoot issues.

### Enabling Debug Mode

You can enable debug mode in several ways:

1. **Global Toggle**: Set `window.__ATOM_DEBUG__ = true` **before** the library script evaluates.
2. **Implicit**: Enabled by default in non-production environments (`process.env.NODE_ENV !== 'production'`).

> **Note**: You can toggle `$.debug.enabled` at runtime from the console to enable or disable visual feedback and logging.

### Visual Feedback

When enabled:

- **Console Logs**: Every DOM update is logged with its selector (e.g., `[atom-binding] DOM updated: div#app.main.text = value`).
- **Visual Highlighting**: Updated elements are temporarily outlined with a red border. This highlight uses a non-blocking `requestAnimationFrame` loop and is automatically cleaned up after a short duration, even if the element is removed from the DOM.
- **Selector Precision**: Logs use a precise `tag#id.class` format (including SVG support) to help you identify the exact source of a change.
