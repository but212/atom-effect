# Common Patterns

> **See also**: [API Reference](./API.md) · [Architecture](./ARCHITECTURE.md) · [Security Guide](./SECURITY.md)

This document outlines standard architectural patterns for implementing `@but212/atom-effect-jquery` within applications.

---

## 1. Async UI Updates

### Using `$.atomFetch`

For HTTP data fetching, `$.atomFetch` handles request cancellation, abort signals, and reactive URL recalculation automatically.

```javascript
const userId = $.atom(1);

const userProfile = $.atomFetch(() => `/api/users/${userId.value}`, {
  defaultValue: null,
});

// 1. Loading State
$('#loading').atomShow(userProfile.isPending);

// 2. Error State
$('#error').atomShow(userProfile.hasError);
$('#error-msg').atomText(userProfile, u => userProfile.lastError?.message ?? '');

// 3. Data Display
$('#username').atomText(userProfile, u => u?.name ?? 'Guest');

// Updating userId triggers a new fetch and aborts any pending request
userId.value = 2;
```

### Using `$.computed` (Non-HTTP)

For asynchronous operations that do not utilize `$.ajax` (e.g., IndexedDB, Web Workers), `$.computed` provides native Promise resolution.

```javascript
const userId = $.atom(1);

const userProfile = $.computed(async () => {
    const res = await fetch(`/api/users/${userId.value}`);
    return res.json();
}, { defaultValue: null });

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
$('#open-btn').on('click', () => isModalOpen.value = true);
$('#close-btn, .modal-backdrop').on('click', () => isModalOpen.value = false);

// Declarative Binding
$('.modal').atomBind({
    class: { 'open': isModalOpen },
    show: isModalOpen
});

// Animation logic isolated in an Effect
$.effect(() => {
    if (isModalOpen.value) $('.modal').fadeIn(200);
    else $('.modal').fadeOut(200);
});
```

---

## 3. SPA Routing

### Hash Mode (Default)

```javascript
const router = $.route({
  target: '#app',
  default: 'home',
  autoBindLinks: true,
  routes: {
    home: { template: '#tmpl-home' },
    about: { template: '#tmpl-about' },
  }
});

// Synchronize document title with route state
$.effect(() => {
  document.title = `My App - ${router.currentRoute.value}`;
});
```

### History Mode (pushState)

For URLs without a hash fragment (requires appropriate server-side configuration):

```javascript
const router = $.route({
  target: '#app',
  default: 'home',
  mode: 'history',
  basePath: '/app',
  autoBindLinks: true,
  routes: {
    home: { template: '#tmpl-home' },
    settings: { template: '#tmpl-settings' },
  }
});
```

### Navigation Guards

The `onLeave` hook allows for conditional navigation. Return `false` to block the transition.

```javascript
const hasUnsavedChanges = $.atom(false);

$.route({
  target: '#app',
  default: 'editor',
  routes: {
    editor: {
      template: '#tmpl-editor',
      onLeave: () => {
        if (hasUnsavedChanges.value) {
          return confirm('Discard unsaved changes?');
        }
      }
    },
    home: { template: '#tmpl-home' },
  }
});
```

---

## 4. Legacy Plugin Integration

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

## 5. Execution Batching

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

> **Note**: jQuery's patched `.on()` method automatically wraps event handlers in `$.batch()`.

---

## 6. Form Implementations

### Typed Inputs

The `atomVal` method supports `parse` and `format` hooks for data transformation during two-way binding.

```javascript
const price = $.atom(9.99);

$('#price-input').atomVal(price, {
  parse:  str => parseFloat(str) || 0,
  format: val => val.toFixed(2),
  debounce: 300,
});
```

### Form Validation (Native API)

The `validation` schema in `atomForm` integrates with the browser's native Constraint Validation API (`setCustomValidity`).

```javascript
const user = $.atom({ name: '', age: 0 });

$('form').atomForm(user, {
  validation: {
    'name': (v) => (v.length >= 2 ? true : 'Name is too short'),
    'age': (v) => (v >= 18 ? '' : 'Must be at least 18')
  }
});
```

When validation fails:

- The input matches the `:invalid` CSS pseudo-class.
- Native browser validation tooltips appear upon form submission.

### Multi-Atom Form Merging

`atomForm` accepts an array of atoms, internally merging them into a unified writable context for forms spanning multiple state domains.

```javascript
const user = $.atom({ name: 'Alice' });
const settings = $.atom({ theme: 'dark' });

$('form').atomForm([user, settings]);
```

---

## 7. Reactive Lists

The `atomList` method utilizes a reconciliation algorithm to synchronize DOM nodes with array state efficiently.

```javascript
const users = $.atom([
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
]);

$('ul').atomList(users, {
  key: u => u.id,
  render: u => `<li class="user-item"><span>${u.name}</span><button class="del">✕</button></li>`,
  onAdd:    $el => $el.hide().fadeIn(200),
  onRemove: $el => $el.fadeOut(200).promise(),
  events: {
    'click .del': (user, index, e) => removeUser(user.id),
  },
});
```

---

## 8. Functional Components

The `atomMount` method encapsulates DOM structure and reactive bindings into isolated units with automatic disposal.

```javascript
const UserCard = ($el, { userId }) => {
  const user = $.atomFetch(() => `/api/users/${userId}`, { defaultValue: null });

  $el.atomBind({
    html: $.computed(() => `<h2>${user.value?.name ?? ''}</h2>`),
    class: { 'loading': user.isPending },
  });

  return () => console.log('Component unmounted');
};

$('#card-root').atomMount(UserCard, { userId: 42 });
```

---

## 9. Web Components (Custom Elements)

> [!WARNING]
> **Avoid Shared State in Static Properties**:
> Declaring mutable state (such as `$.atom` or `$.computed`) directly within static properties (e.g., `static aejBind = { count: $.atom(0) }`) causes that state to be shared across **all** instances of the Custom Element class.
> To ensure each instance has its own isolated reactive state, define atoms as instance properties (e.g., `this.count = $.atom(0)`) and register them via the `setup()` method during connection.

### Declarative Specification

Stylesheets can be defined statically on the class using `aejStyles`. For other reactive bindings (bindings, attributes, slots, etc.), initialize instance properties and register them dynamically.

```javascript
class MyComponent extends HTMLElement {
  static aejStyles = [sharedStyles];

  aej = $.useAtomComponent(this);
  count = $.atom(0);
  title = $.computed(() => `Theme: ${this.aej.attrs('theme').value}`);
  status = $.computed(() => (this.count.value % 2 === 0 ? 'even' : 'odd'));

  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <div class="card">
        <h1 data-aej-bind="title"></h1>
        <slot></slot>
        <div data-aej-part="status">Status: Active</div>
        <button class="inc">Count: <span data-aej-bind="count"></span></button>
      </div>
    `;

    // Register instance-specific reactive features
    this.aej.setup({
      bind: { title: this.title, count: this.count },
      parts: { status: this.status }
    });
  }
}
customElements.define('my-component', MyComponent);
```

### Imperative Setup

Use `aej.setup()` to provide dynamic configuration, such as attaching to a 'closed' ShadowRoot.

```javascript
class AdvancedComponent extends HTMLElement {
  aej = $.useAtomComponent(this);

  connectedCallback() {
    const sr = this.attachShadow({ mode: 'closed' });
    sr.innerHTML = `<div data-aej-bind="title"></div>`;

    this.aej.setup({
      shadowRoot: sr,
      bind: { title: $.atom('Closed Shadow Content') }
    });
  }
}
customElements.define('advanced-component', AdvancedComponent);
```

---

## 10. Dependency Injection

Share state across the DOM tree, including through Shadow DOM boundaries.

### Providing Context

```javascript
const theme = $.atom('light');

// Theme is exposed to all descendants
$.provideAtom(document.body, 'theme', theme);

// Updating the atom updates consumers and CSS variables (--aej-theme)
theme.value = 'dark';
```

### Injecting Context

Consumers maintain connections even if relocated within the DOM hierarchy.

```javascript
class DeepChild extends HTMLElement {
  aej = $.useAtomComponent(this);
  theme = $.injectAtom(this, 'theme');

  connectedCallback() {
    this.aej.setup();

    $.effect(() => {
      console.log('Current theme:', this.theme.value);
    });
  }
}
customElements.define('deep-child', DeepChild);
```

---

## 11. Form-Associated Custom Elements (FACE)

Integrate custom controls into native `<form>` submission and validation pipelines.

```javascript
class MyInput extends HTMLElement {
  static formAssociated = true;

  aej = $.useAtomComponent(this);
  value = $.atom('');
  validation = (v) => (typeof v === 'string' && v.includes('@') ? '' : 'Invalid email');

  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <input type="text" placeholder="Type here...">
    `;

    // Register instance-specific form value and validation logic
    this.aej.setup({
      value: this.value,
      validation: this.validation
    });

    this.aej.$('input').on('input', (e) => {
      this.value.value = e.target.value;
    });
  }
}
customElements.define('my-input', MyInput);
```
