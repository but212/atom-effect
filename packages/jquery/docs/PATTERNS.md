# Common Patterns

> [!TIP]
> **See also**: [jQuery Specification](../../../docs/spec/jquery.md)

This document outlines standard architectural patterns for implementing `@but212/atom-effect-jquery` within applications.

---

## 1. Async UI Updates

### Using `$.computed`

For asynchronous operations (`fetch`, IndexedDB, Web Workers), `$.computed` provides native Promise resolution.

```javascript
const userId = $.atom(1);

const userProfile = $.computed(
  async () => {
    const res = await fetch(`/api/users/${userId.value}`);
    return res.json();
  },
  { defaultValue: null }
);

// isPending and hasError are reactive properties
$('#loading').atomShow(userProfile.isPending);
$('#error').atomShow(userProfile.hasError);
$('#error-msg').atomText($.computed(() => userProfile.lastError?.message ?? ''));

const userName = $.computed(() => userProfile.value?.name ?? 'Guest');
$('#username').atomText(userName);
```

---

## 2. Modals & Dialogs

Bind visibility and state classes directly to reactive variables rather than executing imperative animations in business logic.

```javascript
const isModalOpen = $.atom(false);

// Event Handlers update state
$('#open-btn').on('click', () => (isModalOpen.value = true));
$('#close-btn, .modal-backdrop').on('click', () => (isModalOpen.value = false));

// Declarative Binding
$('.modal').atomBind({
  class: { open: isModalOpen },
  show: isModalOpen,
});

// Animation logic isolated in an Effect
$.effect(() => {
  if (isModalOpen.value) $('.modal').fadeIn(200);
  else $('.modal').fadeOut(200);
});
```

---

## 3. Legacy Plugin Integration

Integrating with third-party plugins that do not emit standard `input` events requires a manual synchronization bridge.

```javascript
const selectedTag = $.atom('react');
const $select = $('#tags').select2();

// Atom -> Plugin Synchronization
$.effect(() => {
  if ($select.val() !== selectedTag.value) {
    $select.val(selectedTag.value).trigger('change');
  }
});

// Plugin -> Atom Synchronization
$select.on('change', (e) => {
  selectedTag.value = e.target.value;
});
```

---

## 4. Execution Batching

Atom notifications are deferred to a microtask by default, coalescing multiple synchronous writes.

```javascript
firstName.value = 'Alice';
lastName.value = 'Smith';
// Effects execute once in the subsequent microtask
```

### Awaiting Flushes

To await these updates without enforcing an immediate synchronous flush, use `$.nextTick()`:

```javascript
firstName.value = 'Alice';
await $.nextTick();
// DOM state is now updated
```

### Synchronous Flushing

Use `$.batch` when effects must execute synchronously within the current call stack (e.g., when reading DOM dimensions immediately after a state change).

```javascript
$.batch(() => {
  firstName.value = 'Alice';
  lastName.value = 'Smith';
});
// Effects have executed synchronously
const updatedText = $('#name').text();
```

> [!NOTE]
> jQuery's patched `.on()` method automatically wraps event handlers in `$.batch()`.

---

## 5. Form Implementations

### Typed Inputs

The `atomVal` method supports `parse` and `format` hooks for data transformation during two-way binding.

```javascript
const price = $.atom(9.99);

$('#price-input').atomVal(price, {
  parse: (str) => parseFloat(str) || 0,
  format: (value) => value.toFixed(2),
  debounce: 300,
});
```

### Form Validation (Native API)

The `validation` schema in `atomForm` integrates with the browser's native Constraint Validation API (`setCustomValidity`).

```javascript
const user = $.atom({ name: '', age: 0 });

$('form').atomForm(user, {
  validation: {
    name: (v) => (v.length >= 2 ? true : 'Name is too short'),
    age: (v) => (v >= 18 ? '' : 'Must be at least 18'),
  },
});
```

When validation fails:
- The input matches the `:invalid` CSS pseudo-class.
- Native browser validation tooltips appear upon form submission.

### Multi-Atom Form Merging

`atomForm` accepts an array of atoms, for forms spanning multiple state domains. Each field reads through the merged view of every source, so the bound value follows the field if a source gains or drops that path. Each write is partitioned to the single source that currently owns the path — the last source defining it, falling back to the first source — so sibling state is never overwritten.

```javascript
const user = $.atom({ name: 'Alice' });
const settings = $.atom({ theme: 'dark' });

$('form').atomForm([user, settings]);
```

Passing an empty array throws: a form with no source can never synchronize.

---

## 6. Reactive Lists

The `atomList` method utilizes a reconciliation algorithm to synchronize DOM nodes with array state efficiently.

```javascript
const users = $.atom([
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
]);

$('ul').atomList(users, {
  key: (u) => u.id,
  render: (u) => `<li class="user-item"><span>${u.name}</span><button class="del">✕</button></li>`,
  onAdd: ($element) => $element.hide().fadeIn(200),
  onRemove: ($element) => $element.fadeOut(200).promise(),
  events: {
    'click .del': (user, index, e) => removeUser(user.id),
  },
});
```

### Duplicate Keys

Duplicate keys are logged and rendered as separate nodes; the exact reconciliation and async-removal rules are in the [jQuery Specification](../../../docs/spec/jquery.md#2-atomlist-reconciliation).

> Prefer keys that are unique and stable (e.g. database IDs). Duplicate keys defeat node reuse and force full re-renders of the affected items.

---

## 7. Functional Components

The `atomMount` method encapsulates DOM structure and reactive bindings into isolated units with automatic disposal.

```javascript
const UserCard = ($element, { userId }) => {
  const user = $.computed(async () => (await fetch(`/api/users/${userId}`)).json(), {
    defaultValue: null,
  });

  $element.atomBind({
    html: $.computed(() => `<h2>${user.value?.name ?? ''}</h2>`),
    class: { loading: user.isPending },
  });

  return () => console.log('Component unmounted');
};

$('#card-root').atomMount(UserCard, { userId: 42 });
```
