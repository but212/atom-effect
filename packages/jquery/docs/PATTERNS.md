# Common Patterns

> **See also**: [API Reference](./API.md) · [Architecture](./ARCHITECTURE.md) · [Security Guide](./SECURITY.md)

## 1. Async UI Updates

### With `$.atomFetch` (Recommended)

For HTTP data fetching, use `$.atomFetch` — it handles auto-cancellation, abort signals, and reactive URL dependencies automatically.

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

// Change userId → auto-refetches, previous request is aborted
userId.value = 2;
```

> See [`$.atomFetch`](./API.md#atomfetchurlfn-options) for the full options reference including `onError` and `eager`.

### With `$.computed` (Manual / Non-HTTP)

For async operations that don't use `$.ajax` (e.g., IndexedDB, Web Workers):

```javascript
const userId = $.atom(1);

const userProfile = $.computed(async () => {
    const res = await fetch(`/api/users/${userId.value}`);
    return res.json();
}, { defaultValue: null });

// isPending / hasError are reactive getters — bind directly, no $.computed wrapper needed
$('#loading').atomShow(userProfile.isPending);
$('#error').atomShow(userProfile.hasError);
$('#error-msg').atomText($.computed(() => userProfile.lastError?.message ?? ''));

const userName = $.computed(() => userProfile.value?.name ?? 'Guest');
$('#username').atomText(userName);
```

> See [`$.atom`, `$.computed`, `$.effect`](./API.md#atomval-computedfn-effectfn) in the API reference.

## 2. Modals & Dialogs

Don't manually `fadeIn`/`fadeOut` in your business logic. Bind visibility to state.

```javascript
const isModalOpen = $.atom(false);

// Logic
$('#open-btn').on('click', () => isModalOpen.value = true);
$('#close-btn, .modal-backdrop').on('click', () => isModalOpen.value = false);

// Binding - Declarative
$('.modal').atomBind({
    class: { 'open': isModalOpen },
    // If you need animation, use an effect instead of simple class binding
    show: isModalOpen
});

// Or customized animation
$.effect(() => {
    if (isModalOpen.value) $('.modal').fadeIn(200);
    else $('.modal').fadeOut(200);
});
```

> See [`.atomBind`](./API.md#atombindbindings), [`.atomShow`/`.atomHide`](./API.md#atomshowbooleanatom--atomhidebooleanatom) in the API reference.

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

// Derive page title from route
const pageTitle = $.computed(() => `My App - ${router.currentRoute.value}`);
$.effect(() => document.title = pageTitle.value);
```

### History Mode (pushState)

For clean URLs without `#`:

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
// URL: /app/settings (no hash)
router.navigate('settings');
```

> **Note**: History mode requires server-side configuration to serve your `index.html` for all routes (e.g., `try_files $uri /index.html` in nginx).

### Navigation Guards

`onLeave` returns `false` to block navigation, or `void`/`true` to allow it.

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
          // confirm() returns true (allow) or false (block)
          return confirm('Discard unsaved changes?');
        }
        // returning undefined implicitly allows navigation
      }
    },
    home: { template: '#tmpl-home' },
  }
});
```

> See [`$.route`](./API.md#routeconfig) for the full config reference (`onEnter`, `onParamsChange`, `onMount`, `beforeTransition`, etc.).
> For internal routing architecture, see [Architecture §7](./ARCHITECTURE.md#7-spa-router).

## 4. Legacy Plugins (Select2, Datepicker)

Integrating with plugins that don't trigger standard `input` events requires a manual bridge.

```javascript
const selectedTag = $.atom('react');

// 1. Initialize Plugin
const $select = $('#tags').select2();

// 2. Sync Atom -> Plugin
$.effect(() => {
    // Guard prevents an infinite loop:
    // effect → sets select → triggers 'change' → updates atom → effect re-runs
    if ($select.val() !== selectedTag.value) {
        $select.val(selectedTag.value).trigger('change');
    }
});

// 3. Sync Plugin -> Atom
$select.on('change', (e) => {
    selectedTag.value = e.target.value;
});
```

> For native inputs, use [`.atomVal`](./API.md#atomvalatom-options) instead — it handles IME, debounce, and cycle prevention automatically.

## 5. Synchronous Flushing with `$.batch`

By default, atom notifications are deferred to a **microtask**. Multiple synchronous writes are automatically coalesced — effects run once with the final values, in the next tick.

```javascript
firstName.value = 'Alice';
lastName.value = 'Smith';
// Effects run once, asynchronously (next microtask)
```

Use `$.batch` only when you need effects to flush **synchronously and immediately** after the writes — for example, to read an updated DOM value in the same call stack.

```javascript
$.batch(() => {
  firstName.value = 'Alice';
  lastName.value = 'Smith';
});
// Effects have already run here, synchronously
const updatedText = $('#name').text(); // reflects new values
```

> jQuery's `.on()` patch automatically wraps event handlers in `$.batch()`, so effects triggered by user interactions always flush synchronously within the handler.
> See [`$.batch`](./API.md#batchfn) in the API reference and [Architecture §3.4](./ARCHITECTURE.md#34-jquery-method-patches) for how the `.on()` patch works.

## 6. Typed Form Inputs

Use `atomVal` with `parse` and `format` for type-safe two-way binding.

```javascript
const price = $.atom(9.99); // number atom

$('#price-input').atomVal(price, {
  parse:  str => parseFloat(str) || 0,   // string → number
  format: val => val.toFixed(2),          // number → string (shown on blur)
  debounce: 300,
});

// Checkbox/radio
const isAgreed = $.atom(false);
$('#agree').atomChecked(isAgreed);

// Select Multiple
const selectedTags = $.atom(['javascript', 'reactive']);
$('#tags-multi').atomVal(selectedTags);
```

> See [`.atomVal`](./API.md#atomvalatom-options) and [`.atomChecked`](./API.md#atomcheckedatom) for the full options reference.
> For IME support, cursor preservation, and cycle-prevention internals, see [Architecture §4](./ARCHITECTURE.md#4-two-way-input-binding).

## 7. Reactive Lists

Use `atomList` for efficient keyed list rendering. It uses LIS-based diffing to minimize DOM operations.

```javascript
const users = $.atom([
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
]);

$('ul').atomList(users, {
  key: u => u.id,
  render: u => `<li class="user-item"><span>${u.name}</span><button class="del">✕</button></li>`,
  onAdd:    $el => $el.hide().fadeIn(200),           // Entry animation
  onRemove: $el => $el.fadeOut(200).promise(),       // Exit animation (async)
  empty:    '<li class="empty">No users found.</li>',
  events: {
    // One listener on the container — O(1) regardless of list size.
    'click .del': (user, index, e) => removeUser(user.id),
    'click':      (user, index, e) => selectUser(user),
  },
});
```

### Delegated events vs. `bind`

| case | `events` | `bind` + `.on()` |
| - | - | - |
| Listeners registered | 1 per event type (on container) | 1 per item per event type |
| Item data access | Provided directly as argument | Captured via closure |
| Reorder / update cost | Zero — listener stays on container | Zero — listener stays on element |
| Best for | Click, dblclick, input, etc. | Reactive atom bindings (`atomText`, `atomClass`, …) |

Use `bind` when you need to attach **reactive bindings** to an item's internals. Use `events` for **DOM event handlers**.

```javascript
$('ul').atomList(itemsAtom, {
  key: 'id',
  render: item => `<li><span class="name"></span><button class="del">✕</button></li>`,
  bind: ($el, item) => {
    // Reactive binding: re-runs when nameAtom changes
    $el.find('.name').atomText(item.nameAtom);
  },
  events: {
    'click .del': (item) => remove(item.id),
  },
});
```

> See [`.atomList`](./API.md#atomlistlistatom-options) for all options (`update`, `onAdd`, `onRemove`, `empty`, `events`).
> For diffing algorithm and delegation internals, see [Architecture §5](./ARCHITECTURE.md#5-list-reconciliation).

## 8. Functional Components

Use `atomMount` to encapsulate DOM structure and reactive bindings into reusable components.

```javascript
const UserCard = ($el, { userId }) => {
  const user = $.atomFetch(() => `/api/users/${userId}`, { defaultValue: null });

  $el.atomBind({
    html: $.computed(() => `<h2>${user.value?.name ?? ''}</h2>`),
    class: { 'loading': user.isPending, 'error': user.hasError },
  });

  // Return cleanup function (optional)
  return () => console.log('UserCard unmounted');
};

$('#card-root').atomMount(UserCard, { userId: 42 });

// Later: tear down component and all its reactive bindings
$('#card-root').atomUnmount();
```

> See [`.atomMount`](./API.md#atommountcomponent-props) and [`.atomUnmount`](./API.md#atomUnmount) in the API reference.
> For component lifecycle internals, see [Architecture §6](./ARCHITECTURE.md#6-component-mounting).
> When rendering user-supplied HTML inside a component, see the [Security Guide](./SECURITY.md) for DOMPurify integration.
> **Shadow DOM:** If your component mounts into a Shadow Root, the automatic `MutationObserver` cannot detect when descendants inside the shadow tree are removed. You must manually call `registry.cleanupTree(shadowRoot)` in your component's cleanup function.
