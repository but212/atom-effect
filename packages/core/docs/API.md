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
```

- `peek()`: Returns the current value without creating a dependency.
- `dispose()`: Disconnects the atom from the engine. After disposal, reading `.value` or `peek()` returns `undefined` (GC release).
- `subscriberCount()`: Returns the number of active subscribers.
- `id`: The unique internal ID of the node.

### Options - atom

- `sync`: Boolean (default `false`). If `true`, updates flush synchronously (bypassing microtask batching). Use with caution.

## `computed<T>(fn: () => T | Promise<T>, options?: ComputedOptions)`

Creates a derived signal that updates automatically when its dependencies change.

### Why it's special - computed

- **Lazy**: Only recalculates when read or when needed by an active effect.
- **Cached**: Returns the cached value if dependencies haven't changed.
- **Async-Aware**: Natively handles Promises.
- **Hot-path Optimized**: Uses a temporal hint to provide $O(1)$ dirty detection for recurring updates and O(1) slot reuse for zero-allocation dependency churn.

### Synchronous Example - computed

```typescript
const count = atom(1);
const double = computed(() => count.value * 2);

console.log(double.value); // 2
```

### Properties - computed

A `ComputedAtom` instance provides the following reactive properties:

- `value`: Returns the current value.
- `state`: Returns `AsyncState` (`IDLE`, `PENDING`, `RESOLVED`, `REJECTED`).
- `hasError`: Boolean indicating if this computation or any of its dependencies failed. Uses an iterative walk to prevent stack overflows in deep chains.
- `isValid`: Shortcut for `!hasError`.
- `errors`: A read-only array of all unique errors collected from the dependency graph via an iterative traversal.
- `lastError`: The specific error thrown by this node's calculation function, if any.
- `isPending`: Shortcut for `state === AsyncState.PENDING`.
- `isResolved`: Shortcut for `state === AsyncState.RESOLVED`.

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
- `isExecuting`: Whether the effect is currently running.
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

> **Note**: The engine already performs automatic microtask batching by default. Use `batch()` only when you need **Synchronous Reflection** (e.g., DOM must reflect updates before the next line). The `batch()` implementation is highly optimized to avoid redundant property lookups and array allocations.

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

Runs a function without tracking dependencies. Any `.value` reads inside the callback are invisible to the enclosing `effect` or `computed`. Optimized with a zero-overhead fast-path for nested untracked calls.

> [!IMPORTANT]
> **No Async Support**: `untracked()` does not support `async` functions. Because the tracking context is restored synchronously in a `finally` block, any reads occurring after an `await` would either leak or be ignored. If you need to read an atom without tracking across an async boundary, use **`peek()`** instead.

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

---

## Lens & Structural Sharing

Lenses provide a type-safe way to create two-way reactive "views" into part of a larger object-based atom. They are essential for managing monolithic state trees with high performance and zero-allocation updates.

### `atomLens<T, P>(atom: WritableAtom<T>, path: P): WritableAtom<PathValue<T, P>>`

Creates a writable "fake" atom that points to a specific dot-path within a source atom.

- **Fine-grained Reactivity**: Lenses are intelligent filters. An effect using a lens will only re-run if the *specific sub-path* changes. Updates to sibling properties in the parent atom are ignored.
- **Path Flattening**: Nested lenses (created via `composeLens`) are automatically optimized into a single node. Composing a lens 10 times results in $O(1)$ node overhead rather than $O(N)$.
- **Subscriber Tracking**: `subscriberCount()` accurately reflects both manual `.subscribe()` listeners and reactive dependencies from effects or computed values.
- **Structural Sharing**: Writing to a lens only clones objects along the modified path. Unrelated branches stay reference-equal (`===`).
- **Equality Guard**: If the new value is identical to the current one (via `Object.is`), the parent atom is not updated, preventing redundant effect propagation.
- **Auto-Autocompletion**: Supports IDE path completion up to 8 levels deep with exact type inference. Filters out non-data properties (methods) and supports numeric array indices.

```typescript
const store = atom({ user: { profile: { name: 'Alice', age: 25 } } });
const nameLens = atomLens(store, 'user.profile.name');

effect(() => {
  console.log(nameLens.value); // Re-runs ONLY when 'name' changes
});

store.value = { ...store.value, user: { ...store.value.user, age: 26 } }; 
// The effect above does NOT re-run because 'name' is still 'Alice'.
```

### `composeLens<T, P>(lens: WritableAtom<T>, path: P)`

Deeper targeting by composing an existing lens with a relative sub-path.

```typescript
const userLens = atomLens(store, 'user');
const nameLens = composeLens(userLens, 'profile.name');
```

### `lensFor(atom)`

Creates a factory function bound to an atom for concise lens creation.

```typescript
const lens = lensFor(store);
const name = lens('user.profile.name');
const age = lens('user.profile.age');
```

### `getPathValue(source: unknown, parts: string[]): unknown`

High-performance utility to retrieve a nested value using an array of path segments.

### `setDeepValue(obj: unknown, keys: string[], index: number, value: unknown): unknown`

The core structural sharing engine. Recursively creates a new object tree, cloning only the necessary nodes.

---

## Advanced: Scheduler Configuration

The global `scheduler` instance can be configured for advanced debugging or performance tuning.

### `scheduler.setMaxFlushIterations(max: number)`

Sets the maximum number of iterations allowed in a single `_drainQueue` cycle before an overflow is triggered.

- Default: `100` (via `SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS`).
- Minimum: `10` (via `SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS`).

### `scheduler.onOverflow: ((droppedCount: number) => void) | null`

Custom callback triggered when the scheduler detects an infinite loop/overflow. Useful for telemetry or specialized error reporting.
