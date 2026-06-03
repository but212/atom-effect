# Design Patterns

This document describes recommended architectural patterns for state management using `@but212/atom-effect`. These patterns prioritize structural sharing, predictable data flow, and optimal V8 performance.

---

## 1. Structural Sharing with Lenses

When managing large, complex objects (like configuration state or deeply nested JSON), updating a single property normally requires cloning the entire object or mutating it directly (which breaks reactivity). **Lenses** provide two-way reactive views into specific paths.

- **Why**: Lenses use path-based structural sharing, meaning only the objects along the modified path are cloned. This preserves referential equality for unaffected branches, suppressing unnecessary downstream re-computations.

### Example: Deep State Management

```typescript
import { atom, atomLens } from '@but212/atom-effect';

const appState = atom({
  user: { name: 'Alice', theme: 'dark' },
  ui: { sidebarOpen: false }
});

// Create a lens pointing to the theme
const themeLens = atomLens(appState, ['user', 'theme']);

// Reading works normally
console.log(themeLens.value); // 'dark'

// Writing updates the parent `appState` immutably
themeLens.value = 'light';
```

---

## 2. Asynchronous Data Fetching

Handling asynchronous data requires managing loading and error states. `computed` natively supports asynchronous resolution.

- **Why**: Using a `defaultValue` allows the rest of the application to render synchronously while the async work happens in the background.

### Example: Async Computed with Defaults

```typescript
import { atom, computed, effect } from '@but212/atom-effect';

const userId = atom(1);

const userProfile = computed(async () => {
  const currentId = userId.value; // Tracked synchronously
  const res = await fetch(`/api/user/${currentId}`);
  if (!res.ok) throw new Error('Fetch failed');
  return res.json();
}, {
  defaultValue: { loading: true } // Synchronous fallback
});

// Reacting to async states
effect(() => {
  if (userProfile.hasError) {
    console.error(userProfile.lastError);
    return;
  }

  if (userProfile.value.loading) {
    console.log('Loading...');
  } else {
    console.log(`Hello ${userProfile.value.name}`);
  }
});
```

---

## 3. State Composition via Merging

Large applications often need to combine isolated state domains into a unified interface for a component.

- **Why**: `mergeAtoms` (read-only) and `mergeLenses` (writable) allow developers to aggregate disparate atoms into a single reactive object without duplicating state or manually synchronizing updates.

### Example: Unifying Writable State

```typescript
import { atom, mergeLenses, atomLens } from '@but212/atom-effect';

const user = atom({ name: 'Alice' });
const settings = atom({ notifications: true });

// Combine specific properties into a unified writable form state
const formState = mergeLenses(
  atomLens(user, ['name']),
  atomLens(settings, ['notifications'])
);

// Updates to formState map back to their respective sources within a single batch
formState.value = { name: 'Bob', notifications: false };
```

---

## 4. Bypassing Reactivity (Untracked)

Sometimes you need to read an atom's value inside an effect *without* subscribing to its changes.

- **Why**: This is common for "submit" actions where the effect should only trigger on the button click, not when the form data changes.

### Example: Untracked Reads

```typescript
import { atom, effect, untracked } from '@but212/atom-effect';

const formData = atom({ /* ... */ });
const submitTrigger = atom(0);

effect(() => {
  // Only re-run when submitTrigger changes
  submitTrigger.value;

  // Read formData without registering it as a dependency
  const data = untracked(() => formData.value);

  // Or using peek() directly
  // const data = formData.peek();

  api.submit(data);
});
```
