# atom-effect-jquery

[![npm version](https://img.shields.io/npm/v/atom-effect-jquery.svg)](https://www.npmjs.com/package/atom-effect-jquery)
[![License](https://img.shields.io/npm/l/atom-effect-jquery.svg)](https://github.com/but212/atom-effect-jquery/blob/main/LICENSE)

**Reactive jQuery bindings powered by [atom-effect](https://github.com/but212/atom-effect).**

`atom-effect-jquery` brings modern, fine-grained reactivity to jQuery applications. It allows you to bind DOM elements directly to atoms, ensuring efficient updates without manual DOM manipulation. It also features automatic cleanup of effects when elements are removed from the DOM, resolving one of the biggest pain points in jQuery development (memory leaks).

## Features

- **Fine-grained Reactivity:** Powered by `@but212/atom-effect`.
- **Two-way Data Binding:** Seamless synchronization for inputs (`val`, `checked`).
- **Auto-Cleanup:** Effects are automatically disposed when elements are removed from the DOM (via MutationObserver).
- **Reparenting-Safe:** DOM elements moved via `.appendTo()`, `.prependTo()`, etc. preserve their reactivity (critical for drag-and-drop libraries like Sortable).
- **Async Removal Handling:** `atomList` properly handles async removal animations without ghost items.
- **Smart Input Formatting:** `atomVal` allows intermediate input (e.g., `1.`, `00`) during typing; formatting is applied on blur.
- **Optimized List Rendering:** `atomList` for efficient array rendering with LIS-based keyed diffing.
- **Debug Mode:** Visual highlighting of DOM updates to trace reactivity.
- **jQuery Integration:** Batching support for standard jQuery events.

## Installation

### NPM

```bash
npm install atom-effect-jquery jquery @but212/atom-effect
# or
pnpm add atom-effect-jquery jquery @but212/atom-effect
```

### CDN

```html
<!-- Load jQuery -->
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<!-- Load atom-effect-jquery -->
<script src="https://cdn.jsdelivr.net/npm/atom-effect-jquery@0.6.1"></script>
```

## Basic Usage

```javascript
// If using NPM:
// import $ from 'jquery';
// import 'atom-effect-jquery';

// 1. Create State
const count = $.atom(0);
const doubled = $.computed(() => count.value * 2);

// 2. Bind to DOM
$('#count').atomText(count);
$('#doubled').atomText(doubled);

// 3. Update State (DOM updates automatically)
$('#increment').on('click', () => count.value++);
$('#decrement').on('click', () => count.value--);

// 4. React to changes (Side Effects)
$.effect(() => {
  console.log(`Current count: ${count.value}, Doubled: ${doubled.value}`);
});
```

## API Reference

### Static Methods

The library extends the main jQuery function `$`:

- `$.atom(initialValue)`: Creates a writable atom.
- `$.computed(() => ...)`: Creates a derived computed atom.
- `$.effect(() => ...)`: Runs a side effect.
- `$.batch(() => ...)`: Batches multiple updates into a single render.
- `$.nextTick()`: Returns a Promise that resolves after the next update cycle.

### DOM Binding Methods

All methods are chainable and return the jQuery object.

#### Text & Content

- **`.atomText(atom, formatter?)`**
  Updates `textContent`. Optional formatter function.
- **`.atomHtml(atom)`**
  Updates `innerHTML`. (⚠️ Use with caution regarding XSS).

#### Attributes & Styles

- **`.atomClass(className, booleanAtom)`**
  Toggles a class based on the atom's truthy value.
- **`.atomCss(property, atom, unit?)`**
  Updates a CSS property. Optional unit (e.g., 'px') can be appended.
- **`.atomAttr(attribute, atom)`**
  Updates an HTML attribute.
- **`.atomProp(property, atom)`**
  Updates a DOM property (e.g., `disabled`, `readOnly`).
- **`.atomShow(booleanAtom)`** / **`.atomHide(booleanAtom)`**
  Toggles visibility using jQuery's `.toggle()`.

#### Two-Way Binding

- **`.atomVal(atom, options?)`**
  Two-way binding for input elements.
  - `options.debounce`: Debounce input updates (ms).
  - `options.format`: Format value before ensuring it in DOM.
  - *Note:* Automatically handles IME types (e.g., for Korean/Chinese).
- **`.atomChecked(booleanAtom)`**
  Two-way binding for checkboxes and radios.

#### Events

- **`.atomOn(event, handler)`**
  Adds an event listener where the handler is automatically wrapped in `$.batch()`.

### Unified Binding (`.atomBind`)

For cleaner code when setting multiple bindings at once.

```typescript
$('div').atomBind({
  text: nameAtom,
  class: { 'active': isActiveAtom },
  css: { 'color': colorAtom },
  on: { click: () => console.log('clicked') }
});
```

### List Rendering (`.atomList`)

Efficiently renders a list of atoms.

```typescript
const items = $.atom(['Apple', 'Banana']);

$('ul').atomList(items, {
  // Unique key for efficient diffing (required)
  key: (item) => item, 
  
  // Render function returning an HTML string or Element
  render: (item) => `<li>${item}</li>`,
  
  // Optional: Bind events/atoms to the created element
  bind: ($el, item) => {
    $el.on('click', () => alert(item));
  }
});
```

### Component Mounting (`.atomMount`)

Mounts a functional component that manages its own lifecycle.

```typescript
const Counter = ($el, props) => {
  const count = $.atom(props.initial || 0);
  
  $el.append('<span>0</span>');
  $el.find('span').atomText(count);
  
  // Return cleanup function (optional)
  return () => console.log('Unmounted');
};

$('#app').atomMount(Counter, { initial: 10 });
```

## Advanced Features

### Transparent Lifecycle Management

Memory management is handled automatically through overrides of standard jQuery methods. You don't need to manually dispose of bindings.

- **`.remove()` / `.empty()`**: Automatically cleans up all associated reactivity and event listeners to prevent memory leaks.
- **`.detach()`**: Preserves bindings and reactivity. Perfect for moving elements around in the DOM without losing their state connection.
- **Auto-Cleanup**: A `MutationObserver` acts as a safety net for elements removed via other means (e.g. `innerHTML`), ensuring eventual cleanup.

### Performance Optimization

The library automatically patches jQuery's event methods (`.on`, `.off`) to wrap handlers in `$.batch()`. This ensures that multiple state updates triggering within a single event (e.g., a click handler) are batched together, resulting in a single re-render.

### Debug Mode

Enable debug mode to see console logs for every DOM update and visually highlight updated elements in the browser.

```typescript
$.atom.debug = true;
```

## License

MIT
