# Onboarding Guide

Welcome to the `@but212/atom-effect-jquery` integration! This guide provides the mental model needed to build reactive, declarative UI components using standard jQuery.

---

## The Mental Model

Traditional jQuery relies on imperative DOM manipulation (e.g., listening to events and manually calling `.text()`, `.addClass()`, or `.show()`).

This package shifts you to a **Declarative & Reactive** model:
1. **State is the Single Source of Truth**: You define your data using Atoms.
2. **DOM is a Projection of State**: You bind jQuery elements to these Atoms.
3. **Automatic Synchronization**: When the Atom changes, the DOM updates automatically.

```text
[State (Atom)] <===(Two-way Binding)===> [Input Element]
      │
      └──────(One-way Binding)──────▶ [Display Element]
```

---

## Core Primitives

Before touching the DOM, you need to understand the core state containers.

### `$.atom(initialValue)`
Atoms hold your mutable state.

```javascript
// Create an atom
const count = $.atom(0);

// Read the value
console.log(count.value); // 0

// Update the value (This triggers DOM updates!)
count.value = 1;
```

### `$.computed(fn)`
Computeds derive state from atoms. They re-calculate automatically when their sources change.

```javascript
const price = $.atom(10);
const total = $.computed(() => price.value * 1.2); // Adds 20% tax
```

### `$.effect(fn)`
Effects execute arbitrary code when state changes. (Most of the time, the jQuery bindings do this for you under the hood).

```javascript
$.effect(() => {
  console.log(`The total is now ${total.value}`);
});
```

---

## DOM Binding Patterns

Instead of writing imperative `.text()` or `.val()` updates, use the `atom*` prefix methods.

### 1. Text and Attributes (One-Way)

Use `.atomText()`, `.atomHtml()`, and `.atomAttr()` to project state into the DOM.

```javascript
const message = $.atom("Hello World");

// The h1 will automatically update whenever message.value changes
$('h1').atomText(message);
```

### 2. Form Inputs (Two-Way)

Use `.atomVal()`, `.atomChecked()`, and `.atomForm()` for inputs. These synchronize the UI to the state *and* the state to the UI.

```javascript
const username = $.atom("");

// Types in the input update the atom. Changing the atom updates the input.
$('#user-input').atomVal(username, { debounce: 200 });
```

### 3. Visibility and Classes

Use `.atomClass()`, `.atomShow()`, and `.atomHide()` to toggle UI states declaratively.

```javascript
const isSaving = $.atom(false);

$('#spinner').atomShow(isSaving);
$('#save-btn').atomClass({ 'disabled': isSaving });
```

### 4. Grouped Bindings

To bind multiple properties to a single element without repeating selectors, use `.atomBind()`.

```javascript
$('#alert-box').atomBind({
  text: message,
  show: $.computed(() => message.value !== ""),
  class: { 'error-state': hasError }
});
```

---

## Reactive Lists

Rendering arrays of data imperative is error-prone. Use `.atomList()` to let the engine handle DOM diffing and element re-use automatically.

```javascript
const todos = $.atom([
  { id: 1, text: 'Learn Atoms' }
]);

$('#todo-list').atomList(todos, {
  key: todo => todo.id, // Critical for performance
  render: todo => `<li class="todo-item"></li>`,
  bind: ($el, todo) => {
    // This function runs once when the element is created
    $el.atomText($.computed(() => todo.text));
  }
});
```

---

## Next Steps

- Check out [PATTERNS.md](./PATTERNS.md) for architectural strategies like routing and data fetching.
- Read [LIFECYCLE.md](./LIFECYCLE.md) to understand how the engine prevents memory leaks and cleans up the DOM.
- Browse [API.md](./API.md) for the complete method reference.
