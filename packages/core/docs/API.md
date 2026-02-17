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
- `maxAsyncRetries`: Number (default `3`). Maximum number of async retries before giving up when dependency drift is detected.

## `effect(fn: () => void | CleanupFn, options?: EffectOptions)`

Runs a side effect immediately, and re-runs it whenever dependencies change.

### When to use - effect

- **DOM Updates**: Manually syncing state to UI (if not using a framework adapter).
- **Network Requests**: Triggering analytics or saves.
- **Subscriptions**: syncing with external libraries.

### Example - effect

```typescript
const effectHandle = effect(() => {
  const currentCount = count.value;
  document.title = `Count: ${currentCount}`;

  // Optional cleanup function
  return () => {
    console.log(`Cleaning up count ${currentCount}`);
  };
});

// Later: stop the effect
effectHandle.dispose();
```

`effect()` returns an `EffectObject` with the following properties:

- `dispose()`: Stops the effect and runs cleanup.
- `run()`: Manually re-executes the effect.
- `isDisposed`: Whether the effect has been disposed.
- `executionCount`: Number of times the effect has executed.

### Options - effect

- `sync`: Boolean (default `false`). Force synchronous execution.
- `onError`: `(error: unknown) => void`. Custom error handler.
- `maxExecutionsPerSecond`: Number (default `1000`). Maximum executions per second (dev mode only).
- `maxExecutionsPerFlush`: Number (default `100`). Maximum executions per flush cycle before infinite loop detection triggers.

## `batch(fn: () => void)`

Groups multiple state updates into a single notification cycle. Effects and computed values are deferred until the batch completes, then flushed **synchronously**.

### When to use - batch

- **Consistency**: Ensuring a set of atoms are updated together before any effect runs.
- **Performance**: Making multiple mutations that should be one "transaction".

> **Note**: The engine already performs automatic microtask batching by default. Use `batch()` only when you need **synchronous** flush (e.g., DOM must reflect updates before the next line).

### Basic Example - batch

```typescript
import { atom, batch, effect } from '@but212/atom-effect';

const firstName = atom('');
const lastName = atom('');

effect(() => {
  console.log(`${firstName.value} ${lastName.value}`);
});
// Output: " "

batch(() => {
  firstName.value = 'John';
  lastName.value = 'Doe';
  // No effects run inside this block
});
// Output: "John Doe" (flushed synchronously after batch)
```

### Form Submission Example - batch

```typescript
const email = atom('');
const password = atom('');
const errors = atom<string[]>([]);

function handleSubmit(formData: FormData) {
  batch(() => {
    email.value = formData.get('email') as string;
    password.value = formData.get('password') as string;
    errors.value = [];
  });
  // All validation effects run here with consistent state
}
```

### Nested Batch Example - batch

```typescript
batch(() => {
  atom1.value = 'a';
  batch(() => {
    atom2.value = 'b';
    atom3.value = 'c';
    // Inner batch does NOT flush here
  });
  atom4.value = 'd';
  // Outer batch flushes all four updates here
});
```

### Return Value - batch

`batch()` returns the value returned by `fn`:

```typescript
const result = batch(() => {
  count.value = 10;
  return count.value * 2;
}); // result === 20
```

## `untracked<T>(fn: () => T): T`

Runs a function without tracking dependencies. Any `.value` reads inside the callback are invisible to the enclosing `effect` or `computed`.

### When to use - untracked

- **Read without subscribing**: Access a value for computation without creating a dependency.
- **Logging / Debugging**: Read state for logging without re-triggering the effect on every change.
- **Conditional dependencies**: Selectively opt-out of tracking for specific reads.

### Basic Example - untracked

```typescript
import { atom, effect, untracked } from '@but212/atom-effect';

const source = atom(0);
const config = atom('verbose');

effect(() => {
  // Tracked: effect re-runs when `source` changes
  const val = source.value;

  // Untracked: effect does NOT re-run when `config` changes
  const mode = untracked(() => config.value);

  console.log(`[${mode}] Value: ${val}`);
});
```

### Conditional Dependency Example - untracked

```typescript
const searchQuery = atom('');
const searchResults = atom<string[]>([]);
const totalCount = atom(0);

effect(() => {
  const query = searchQuery.value; // Tracked

  // Only read totalCount without tracking — we don't want
  // this effect to re-run when totalCount changes
  const count = untracked(() => totalCount.value);

  console.log(`Searching "${query}" (${count} total results so far)`);
});
```

### Inside Computed Example - untracked

```typescript
const items = atom([1, 2, 3]);
const multiplier = atom(2);

const result = computed(() => {
  // Recompute when items change, but NOT when multiplier changes
  return items.value.map(i => i * untracked(() => multiplier.value));
});
```
