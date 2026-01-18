# @but212/atom-effect-jquery

[![npm version](https://img.shields.io/npm/v/@but212/atom-effect-jquery.svg)](https://www.npmjs.com/package/@but212/atom-effect-jquery)
[![License](https://img.shields.io/npm/l/@but212/atom-effect-jquery.svg)](https://github.com/but212/atom-effect/blob/main/packages/jquery/LICENSE)

Reactive jQuery bindings.

## Installation

```bash
npm install @but212/atom-effect-jquery jquery
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
| `$.batch(fn)` | Batches updates. |
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

Binds event handler wrapped in `batch()` for performance.

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
- **Batched Events**: `.atomOn` automatically wraps handlers in `$.batch()` to prevent UI jitter during multiple state changes.
- **Reparenting-Safe**: Elements can be moved within the DOM without losing their reactive bindings.

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
