# Common Patterns

> **See also**: [API Reference](./API.md) · [Architecture](./ARCHITECTURE.md) · [Security Guide](./SECURITY.md)

## 1. Async UI Updates

### Using `$.atomFetch`

For HTTP data fetching, `$.atomFetch` manages cancellation, abort signals, and reactive URL dependencies.

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

// Change userId → triggers re-fetch and aborts the previous request
userId.value = 2;
```

> See [`$.atomFetch`](./API.md#atomfetchurlfn-options) for the full options reference.

### Using `$.computed` (Non-HTTP)

For asynchronous operations that do not use `$.ajax` (e.g., IndexedDB, Web Workers):

```javascript
const userId = $.atom(1);

const userProfile = $.computed(async () => {
    const res = await fetch(`/api/users/${userId.value}`);
    return res.json();
}, { defaultValue: null });

// isPending and hasError are reactive getters
$('#loading').atomShow(userProfile.isPending);
$('#error').atomShow(userProfile.hasError);
$('#error-msg').atomText($.computed(() => userProfile.lastError?.message ?? ''));

const userName = $.computed(() => userProfile.value?.name ?? 'Guest');
$('#username').atomText(userName);
```

## 2. Modals & Dialogs

Bind visibility to state rather than manually triggering animations in business logic.

```javascript
const isModalOpen = $.atom(false);

// Event Handlers
$('#open-btn').on('click', () => isModalOpen.value = true);
$('#close-btn, .modal-backdrop').on('click', () => isModalOpen.value = false);

// Declarative Binding
$('.modal').atomBind({
    class: { 'open': isModalOpen },
    show: isModalOpen
});

// Animation via Effect
$.effect(() => {
    if (isModalOpen.value) $('.modal').fadeIn(200);
    else $('.modal').fadeOut(200);
});
```

## 3. Routing

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

// Synchronize page title with route state
$.effect(() => {
  document.title = `My App - ${router.currentRoute.value}`;
});
```

### History Mode (pushState)

For URLs without a hash fragment:

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

> **Note**: History mode requires server-side configuration to serve the entry point (e.g., `index.html`) for all registered routes.

### Navigation Guards

The `onLeave` hook allows for conditional navigation. Return `false` to block or `true`/`void` to permit.

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

## 4. Legacy Plugins (Select2, Datepicker)

Integrating with plugins that do not emit standard `input` events requires a manual synchronization bridge.

```javascript
const selectedTag = $.atom('react');
const $select = $('#tags').select2();

// Atom -> Plugin
$.effect(() => {
    if ($select.val() !== selectedTag.value) {
        $select.val(selectedTag.value).trigger('change');
    }
});

// Plugin -> Atom
$select.on('change', (e) => {
    selectedTag.value = e.target.value;
});
```

## 5. Synchronous Flushing with `$.batch`

Atom notifications are deferred to a microtask by default, allowing multiple synchronous writes to be coalesced.

```javascript
firstName.value = 'Alice';
lastName.value = 'Smith';
// Effects execute once in the subsequent microtask
```

To await these updates without an immediate flush, use `$.nextTick()`:

```javascript
firstName.value = 'Alice';
await $.nextTick();
// DOM state is now updated
```

Use `$.batch` when effects must execute synchronously within the same call stack, such as when reading updated DOM properties.

```javascript
$.batch(() => {
  firstName.value = 'Alice';
  lastName.value = 'Smith';
});
// Effects have executed synchronously
const updatedText = $('#name').text();
```

> jQuery's `.on()` patch automatically wraps handlers in `$.batch()`.

## 6. Typed Form Inputs

The `atomVal` method supports `parse` and `format` hooks for data transformation.

```javascript
const price = $.atom(9.99);

$('#price-input').atomVal(price, {
  parse:  str => parseFloat(str) || 0,
  format: val => val.toFixed(2),
  debounce: 300,
});
```

## 7. Reactive Lists

The `atomList` method uses a 3-pass reconciliation algorithm to synchronize DOM operations with array state.

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

### Event Management

| Approach | `events` | `bind` + `.on()` |
| - | - | - |
| Registration | Single listener on container | Listener per item |
| Data Access | Passed as argument | Captured via closure |
| Recommended for | DOM events (click, input) | Reactive bindings (`atomText`, etc.) |

## 8. Functional Components

The `atomMount` method encapsulates DOM structure and reactive bindings into reusable units.

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

## 9. Web Components (Custom Elements)

Integrate AEJ into standard Custom Elements using `useAtomComponent`.

```javascript
class MyComponent extends HTMLElement {
  static observedAttributes = ['theme'];
  private aej = $.useAtomComponent(this);
  private count = $.atom(0);

  connectedCallback() {
    const sr = this.attachShadow({ mode: 'open' });
    sr.innerHTML = `
      <div class="card">
        <h1 data-bind="title"></h1>
        <slot></slot>
        <button class="inc">Count: <span data-bind="count"></span></button>
      </div>
    `;

    // 1. Setup reactive features
    this.aej.setup({
      shadowRoot: sr,
      bind: { 
        title: $.computed(() => `Theme: ${this.aej.attrs('theme').value}`),
        count: this.count
      },
      dispatch: { 
        'count-changed': this.count // Dispatches CustomEvent when count changes
      }
    });

    // 2. Scoped event handling
    this.aej.$('.inc').on('click', () => this.count.value++);
  }

  disconnectedCallback() {
    // 3. Automated cleanup of effects and listeners
    this.aej.teardown();
  }
}
customElements.define('my-component', MyComponent);
```

## 10. Dependency Injection (Context API)

Share state across the DOM tree without prop-drilling.

### Providing Context

```javascript
const theme = $.atom('light');

// Theme is available to all descendants of document.body
$.provideAtom(document.body, 'theme', theme);

// Updating the atom updates all consumers and CSS variables (--aej-theme)
theme.value = 'dark';
```

### Injecting Context

Consumers automatically re-discover providers if moved in the DOM.

```javascript
class DeepChild extends HTMLElement {
  private aej = $.useAtomComponent(this);
  private theme = $.injectAtom(this, 'theme');

  connectedCallback() {
    this.aej.setup();

    // Use injected atom like any other atom
    $.effect(() => {
      console.log('Current theme:', this.theme.value);
    });
  }

  disconnectedCallback() {
    this.aej.teardown();
  }
}
```
