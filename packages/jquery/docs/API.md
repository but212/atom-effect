# jQuery Integration API

This package extends jQuery with reactive capabilities. All methods are available on jQuery objects (`$(selector).method()`).

## Unified Binding

### `.atomBind(bindings)`

The preferred way to apply multiple bindings at once.

```javascript
$('.user-card').atomBind({
  text: nameAtom,                 // same as .text(val)
  class: { 'active': isActive },  // toggle class
  css: { 'color': colorAtom },    // style property
  attr: { 'data-id': idAtom },    // attribute
  show: isVisible,                // show/hide
  on: { click: handleClick }      // event handler
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

Updates `innerHTML`. **Warning**: Ensure content is trusted to avoid XSS.

### `.atomClass(className, booleanAtom)`

Toggles `className` based on the atom's truthiness.

```javascript
$('#btn').atomClass('disabled', isLoading);
```

### `.atomCss(property, atom)`

Updates a single CSS property.

```javascript
$('.box').atomCss('opacity', opacityLevel);
```

### `.atomAttr(attribute, atom)`

Updates an HTML attribute.

```javascript
$('img').atomAttr('src', imageUrl);
```

### `.atomProp(property, atom)`

Updates a DOM property (e.g., `checked`, `disabled`, `value`).

```javascript
$('input').atomProp('disabled', shouldDisable);
```

---

## Control Flow

### `.atomShow(booleanAtom)` / `.atomHide(booleanAtom)`

Toggles visibility (`display: none`).

```javascript
$('.loading-spinner').atomShow(isLoading);
```

### `.atomList(listAtom, options)`

Efficiently renders a list of items using keyed diffing.

**Options**:

- `key`: `(item) => string | number` (Required) - Unique ID for diffing.
- `render`: `(item, index) => string | JQuery` - HTML string or jQuery object for new items.
- `bind`: `($el, item, index) => void` - Bind events/atoms to the created element.
- `update`: `($el, item, index) => void` - Manually update existing elements (optimization).
- `onAdd`: `($el) => void` - Called when an item is added to the DOM.
- `onRemove`: `($el) => Promise<void> | void` - Called before removal (supports async exit animations).
- `empty`: `string | JQuery` - Content to show when the list is empty.

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

---

## Static Methods

### `$.atom(val)`, `$.computed(fn)`, `$.effect(fn)`

Aliases to the core functions, exposed for convenience.

---

## Routing

### `$.route(config)`

Creates a lightweight, hash-based SPA router with reactive state management.

**Configuration**:

- `target`: Selector for the container element where routes will be rendered.
- `default`: Name of the default route to load if the hash is empty.
- `routes`: Object mapping route names to definitions. Each route must specify **either** `template` **or** `render`, but not both (mutually exclusive).
  - `template`: Selector for a `<template>` element to clone.
  - `render`: Custom function `(container, route, params) => void`.
  - `onEnter`: Hook called before rendering. Can return additional params.
  - `onLeave`: Hook called before navigating away. Return `false` to cancel.
- `notFound`: (Optional) Route name to use when no match is found.
- `autoBindLinks`: (Optional) If `true`, automatically handles clicks on `[data-route]` links.
- `activeClass`: (Optional) CSS class for active links (default: `'active'`).
- `beforeTransition`: (Optional) Global hook `(from, to) => void`.
- `afterTransition`: (Optional) Global hook `(from, to) => void`.

**Returns**:

A `Router` object with:

- `currentRoute`: `WritableAtom<string>` containing the active route name.
- `navigate(route)`: Programmatically change route.
- `destroy()`: Cleanup listeners and effects.

**Example**:

```javascript
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
```
