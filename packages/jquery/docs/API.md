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
  visible: isVisible,             // show/hide
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
- `render`: `(item) => string` - HTML string for new items.
- `bind`: `($el, item) => void` - Function to bind events/atoms to the created element.

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
- `format`: `(val) => string` - Format value on blur.
- `parse`: `(str) => val` - Parse string input before updating atom.

```javascript
$('#search').atomVal(queryAtom, { debounce: 300 });
```

---

## Static Methods

### `$.atom(val)`, `$.computed(fn)`, `$.effect(fn)`

Aliases to the core functions, exposed for convenience.
