# @but212/atom-effect-jquery

[![npm version](https://img.shields.io/npm/v/@but212/atom-effect-jquery.svg)](https://www.npmjs.com/package/@but212/atom-effect-jquery)
[![License](https://img.shields.io/npm/l/@but212/atom-effect-jquery.svg)](https://github.com/but212/atom-effect/blob/main/packages/jquery/LICENSE)

Reactive jQuery bindings.

## Installation

```bash
npm install @but212/atom-effect-jquery jquery
```

### CDN

```html
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@but212/atom-effect-jquery@0.16.0"></script>
```

## Basic Usage

```javascript
import $ from 'jquery';
import '@but212/atom-effect-jquery';

const count = $.atom(0);

// Bind text
$('#count').atomText(count);

// Update state
$('#btn').on('click', () => count.value++);
```

## API Reference

All methods return the jQuery object for chaining.
Bindings automatically clean up when elements are removed.

### Static Methods

| Method | Description |
| --- | --- |
| `$.atom(val)` | Creates a writable atom. |
| `$.computed(fn)` | Creates a computed atom. |
| `$.effect(fn)` | Runs a side effect. |
| `$.batch(fn)` | Groups updates for synchronous reflection. |
| `$.isAtom(val)` | Checks if value is an atom. |

### Content & Attributes

| Method | Description |
| --- | --- |
| `.atomText(atom, formatter?)` | Binds text content. |
| `.atomHtml(atom)` | Binds inner HTML. |
| `.atomClass(class, boolAtom)` | Toggles class based on boolean atom. |
| `.atomCss(prop, atom, unit?)` | Binds CSS property. |
| `.atomAttr(attr, atom)` | Binds HTML attribute. |
| `.atomProp(prop, atom)` | Binds DOM property. |
| `.atomShow(boolAtom)` | Shows element if true. |
| `.atomHide(boolAtom)` | Hides element if true. |

### Form Bindings

#### `.atomVal(atom, options?)`

Two-way binding for inputs.

- `options.debounce`: (ms) Debounce updates.
- `options.format`: (fn) Format value on blur.

#### `.atomChecked(boolAtom)`

Two-way binding for checkboxes/radios.

### Events

#### `.atomOn(event, handler)`

Binds event handler with automatic lifecycle management (cleanup).

### Unified Binding

#### `.atomBind(bindings)`

Apply multiple bindings at once.

```javascript
$('.card').atomBind({
  text: titleAtom,
  class: { 'active': isActive },
  css: { 'color': colorAtom },
  on: { click: handleClick }
});
```

### List Rendering

#### `.atomList(listAtom, options)`

Efficiently renders a list of items using keyed diffing.

```javascript
$('ul').atomList(items, {
  key: (item) => item.id,
  render: (item) => `<li>${item.name}</li>`,
  bind: ($el, item) => {
    $el.on('click', () => select(item));
  }
});
```

**Options**: `key` (required), `render`, `bind`, `onAdd`, `onRemove`, `empty`.

### Components

#### `.atomMount(Component, props)`

Mounts a functional component with its own lifestyle management.

```javascript
const Counter = ($el, props) => {
  const count = $.atom(props.start);
  $el.atomText(count);
  return () => console.log('cleanup');
};

$('#app').atomMount(Counter, { start: 10 });
```

## Key Features

- **Automatic Lifecycle**: Bindings clean up automatically when jQuery elements are removed (`$.cleanData` integration).
- **Fine-grained Updates**: Only the specific element property/attribute changes, preventing full list re-renders.
- **Reparenting-Safe**: Elements can be moved within the DOM without losing their reactive bindings.

## Automatic Batching

When `enablejQueryOverrides()` is called, all event handlers registered via jQuery (`.on()`, etc.) are automatically wrapped in `batch()`. This ensures:

1. **Synchronous Reflection**: Any atom updates within the handler are flushed to the DOM immediately after the handler finishes execution, but before the browser repaints.
2. **Atomic Updates**: Multiple atom updates are grouped into a single DOM update. This prevents redundant renders and ensures that the DOM never reflects a partial state.

> **Note**: Reading DOM properties (like `text()`) immediately after an atom update **inside the same synchronous handler** will still return the old value. The DOM is synchronized only when the handler returns and the batch block completes.

### The "Async Trap"

Automatic batching only covers the **synchronous** execution of the handler. If you use `async/await`, updates occurring after an `await` are no longer inside the `batch()` scope.

```javascript
$('#btn').on('click', async () => {
  count.value++; // Batched (synchronous)
  
  await fetchData();
  
  // No longer in batch scope! 
  // Updates will be batched via microtasks (asynchronous reflection)
  count.value++; 
});
```

If you need synchronous reflection after an `await`, wrap the updates manually:

```javascript
await fetchData();
$.batch(() => {
  count.value++;
});
```

## Debug Mode

Enable internal logging and dependency tracing:

```javascript
$.atom.debug = true;
```

When enabled, any potential infinite loops or self-modifying effects will trigger detailed console warnings with trace info.

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

## License

MIT © [Jeongil Suk](https://github.com/but212)
