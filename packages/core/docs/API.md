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

- `name`: String. Optional name used for debugging and traceability.
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
- `hasError`: Boolean indicating if the computation (or its dependencies) failed.
- `isValid`: Shortcut for `!hasError`.
- `errors`: A read-only array of all errors in the local dependency sub-graph.
- `lastError`: The specific error thrown by this node's computation.
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

> [!IMPORTANT]
> **Dependency Tracking is Synchronous**: Inside an async function, only atoms/computeds accessed **before** the first `await` are tracked as dependencies. Values read after an `await` will return their current value but will not trigger re-evaluations when they change. Always "hoist" your dependency reads to the top of your async function.

### Options - computed

- `name`: String. Optional name used for debugging and traceability.
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
- `[Symbol.dispose]()`: Support for explicit resource management (TS 5.2+).
- `run()`: Manually re-executes the effect.
- `isDisposed`: Whether the effect has been disposed.
- `isExecuting`: Whether the effect is currently running.
- `executionCount`: Number of times the effect has executed.

### Options - effect

- `name`: String. Optional name used for debugging and traceability.
- `sync`: Boolean (default `false`). Force synchronous execution.
- `onError`: `(error: unknown) => void`. Custom error handler.
- `maxExecutionsPerSecond`: Number (default `1000`). Maximum executions per second (dev mode only).
- `maxExecutionsPerFlush`: Number (default `100`). Maximum executions per flush cycle before infinite loop detection triggers.

## `batch<T>(fn: () => T): T`

Groups multiple state updates into a single synchronous notification cycle. Effects and computed values are deferred until the batch completes, then flushed.

- **Returns**: The return value of `fn`.
- **Nesting**: Fully supports deep nesting. Updates are coalesced and flushed only once after the outermost batch ends.
- **Stability**: Guaranteed protection against stack overflows in deeply recursive reactive patterns via a flat execution loop.
- **Atomicity**: Changes made to atoms within a batch are committed even if the callback throws an error, ensuring state integrity.

> **Note**: The engine already performs automatic microtask batching by default. Use `batch()` specifically when you need **Synchronous Reflection** (e.g., updates must be applied before the next line of code executes) or to group multiple mutations into a single transactional flush.

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

## Error Handling

The library provides a structured error hierarchy to help you identify and recover from issues in the reactive graph.

### `AtomError` (Base Class)

All errors thrown by the system inherit from `AtomError`.

- **Properties**:
  - `message`: Human-readable description.
  - `cause`: The original error or value that triggered this error (`unknown`).
  - `recoverable`: Boolean indicating if the system can potentially recover if dependencies change.
  - `code`: Optional machine-readable string (e.g., `ERR_CIRCULAR_DEP`).
- **Methods**:
  - `getChain()`: Returns an array of the entire error chain, from the current error down to the root cause.
  - `toJSON()`: Returns a plain object representation for logging.

### Specialized Errors

- `ComputedError`: Thrown when a computation fails. Usually `recoverable: true`.
- `EffectError`: Thrown during effect execution or cleanup. Usually `recoverable: false`.
- `SchedulerError`: Thrown by the execution engine (e.g., infinite loop detection).

### `AtomErrorConstructor` (Type)

A specialized constructor type for Atom errors, ensuring consistent signatures across the system.

```typescript
type AtomErrorConstructor = new (
  message: string,
  cause?: unknown,
  recoverable?: boolean,
  code?: string
) => AtomError;
```

### `wrapError(error: unknown, ErrorClass: AtomErrorConstructor, context: string): AtomError`

Wraps any value into the Atom error hierarchy. If the input is already an `AtomError`, it creates a new wrapper to preserve the propagation context, building a "trace" of how the error traveled through your atoms.

---

## Lens & Structural Sharing

Lenses provide a type-safe way to create two-way reactive "views" into part of a larger object-based atom. They are essential for managing monolithic state trees with high performance and zero-allocation updates.

### `atomLens<T, P>(atom: WritableAtom<T>, path: P): WritableAtom<PathValue<T, P>>`

Creates a writable "fake" atom that points to a specific dot-path within a source atom.

- **Structural Sharing**: Writing to a lens only clones objects along the modified path. Unrelated branches stay reference-equal (`===`).
- **Equality Guard**: If the new value is identical to the current one (via `Object.is`), the parent atom is not updated, preventing redundant effect propagation.
- **Nullable Support**: Correctly resolves types for optional (`?`) or nullable properties using `NonNullable` internally.
- **Auto-Autocompletion**: Supports IDE path completion up to 8 levels deep with exact type inference.

```typescript
const store = atom({ user: { profile: { name: 'Alice' } } });
const nameLens = atomLens(store, 'user.profile.name');

console.log(nameLens.value); // 'Alice'
nameLens.value = 'Bob'; // Atomically updates store.user.profile.name
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

## `debug` Utilities

The `debug` object provides several utilities for troubleshooting and inspecting the reactive graph. In production builds, these utilities are swapped for zero-overhead no-op functions unless explicitly enabled.

### `debug.dumpGraph()`

Returns an array containing metadata for all currently active reactive nodes (Atoms, Computeds, Effects).

- **Returns**: `Array<{ id: number, name: string, type: string, updateCount: number }>`
- **Usage**: Useful for building DevTools or inspecting the state of the reactive graph at runtime.
- **Note**: Uses `WeakRef` internally; only returns nodes that have not been garbage collected.

### `debug.trackUpdate(id: DependencyId, name?: string)`

Increments the update count for a specific node to detect infinite loops. While automatically called by the engine's internal setters and executors, it can be used for custom instrumentation.

### `debug.getDebugName(node: object)` / `debug.getDebugType(node: object)`

Retrieves the debug name and type metadata attached to a reactive node.

---

## Global Debug Toggle

Even in production-mode builds, you can enable debug features at runtime. Because the library swaps the debug implementation at load time for zero-overhead performance, the global flag must be set **before** the library script evaluates.

You can accomplish this by either setting it in your HTML `<head>`, or by using `sessionStorage` and refreshing the page (which is evaluated when resolving the initial state):

```javascript
// Method 1: Set before script loads
window.__ATOM_DEBUG__ = true;

// Method 2: Set in sessionStorage and refresh
sessionStorage.setItem('__ATOM_DEBUG__', 'true');
```

This bypasses the `ProdDebugController` no-op implementation and activates full tracking and logging features.
