# Common Patterns

## 1. Async UI Updates

Handling async data (like fetching a user profile) often involves a loading state, an error state, and the data itself.

```javascript
const userId = $.atom(1);

// Computed Async State
const userProfile = $.computed(async () => {
    const res = await fetch(`/api/users/${userId.value}`);
    return res.json();
}, { defaultValue: null });

// 1. Loading State
$('#loading').atomShow($.computed(() => userProfile.isPending));

// 2. Error State
$('#error').atomShow($.computed(() => userProfile.hasError));
$('#error-msg').atomText($.computed(() => userProfile.lastError?.message));

// 3. Data Display
const userName = $.computed(() => userProfile.value?.name ?? 'Guest');
$('#username').atomText(userName);
```

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

Integrating with plugins that don't trigger standard `input` events requires a manual bridge.

```javascript
const selectedTag = $.atom('react');

// 1. Initialize Plugin
const $select = $('#tags').select2();

// 2. Sync Atom -> Plugin
$.effect(() => {
    // Only update if different to avoid infinite loops
    if ($select.val() !== selectedTag.value) {
        $select.val(selectedTag.value).trigger('change');
    }
});

// 3. Sync Plugin -> Atom
$select.on('change', (e) => {
    selectedTag.value = e.target.value;
});
```
