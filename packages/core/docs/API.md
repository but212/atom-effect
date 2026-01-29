# API Reference

This document covers the core primitives of `@but212/atom-effect`.

## `atom<T>(initialValue: T, options?: AtomOptions)`

Creates a mutable state container. Atoms are the leaf nodes of your dependency graph.

### When to use - atom

- **Store source of truth:** User inputs, server data, configuration.
- **Avoid:** Storing derived data (use `computed` instead).

### Example - atom

```typescript
import { atom } from '@but212/atom-effect';

const counter = atom(0);

// Read (tracks dependency if inside effect/computed)
console.log(counter.value); 

// Write (notifies observers)
counter.value = 1;

// Peek (read without tracking)
console.log(counter.peek()); 
```

### Options - atom

- `name`: String for debugging purposes.
- `sync`: Boolean (default `false`). If `true`, updates flush synchronously (bypassing microtask batching). Use with caution.

## `computed<T>(fn: () => T | Promise<T>, options?: ComputedOptions)`

Creates a derived signal that updates automatically when its dependencies change.

### Why it's special - computed

- **Lazy**: Only recalculates when read or when needed by an active effect.
- **Cached**: Returns the cached value if dependencies haven't changed.
- **Async-Aware**: Natively handles Promises.

### Synchronous Example - computed

```typescript
const count = atom(1);
const double = computed(() => count.value * 2);

console.log(double.value); // 2
```

### Async Example - computed

```typescript
const userId = atom(123);

const userData = computed(async () => {
  const response = await fetch(`/api/users/${userId.value}`);
  return response.json();
}, { defaultValue: { loading: true } });

// userData.value returns the resolved value (or defaultValue if pending)
// Race conditions are handled via promise cancellation (see ARCHITECTURE.md)
```

### Options - computed

- `equal`: `(a, b) => boolean`. Custom equality check.
- `defaultValue`: Initial value while async computation is pending.
- `lazy`: Boolean (default `true`).
- `onError`: `(error: Error) => void`. Error handler for computation failures.

## `effect(fn: () => void | CleanupFn, options?: EffectOptions)`

Runs a side effect immediately, and re-runs it whenever dependencies change.

### When to use - effect

- **DOM Updates**: Manually syncing state to UI (if not using a framework adapter).
- **Network Requests**: Triggering analytics or saves.
- **Subscriptions**: syncing with external libraries.

### Example - effect

```typescript
const dispose = effect(() => {
  const currentCount = count.value;
  document.title = `Count: ${currentCount}`;

  // Optional cleanup function
  return () => {
    console.log(`Cleaning up count ${currentCount}`);
  };
});

// Later: stop the effect
dispose();
```

### Options - effect

- `sync`: Boolean (default `false`). Force synchronous execution.
- `onError`: Custom error handler.

## `batch(fn: () => void)`

Groups multiple state updates into a single notification cycle.

### When to use - batch

- **Performance**: Making 1000s of mutations that should essentially be one "transaction".
- **Consistency**: Ensuring a set of atoms are updated together before any effect runs.

```typescript
batch(() => {
  atom1.value = 'a';
  atom2.value = 'b';
  // Effects run only after this block finishes
});
```

## `untracked<T>(fn: () => T): T`

Runs a function without tracking dependencies.

### Example - untracked

```typescript
effect(() => {
  // We want to log changes to 'A', but we need 'B's value without tracking 'B'
  console.log(atomA.value, untracked(() => atomB.value));
});
```
