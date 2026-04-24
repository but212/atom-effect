# API Reference

This document provides a detailed reference for the core primitives of `@but212/atom-effect`. It is intended for developers who need to understand the behavior, options, and technical implementation details of the library.

## `atom<T>(initialValue: T, options?: AtomOptions)`

Creates a mutable state container, known as an **atom**. Atoms serve as the leaf nodes in the reactive dependency graph.

### Usage

Atoms are used for managing primary state such as user inputs, configuration, or server data. Derived state should be managed using `computed`.

### Example

```typescript
import { atom } from '@but212/atom-effect';

const counter = atom(0);

// Read the value (tracks dependency if inside effect/computed)
console.log(counter.value); 

// Update the value (notifies observers)
counter.value = 1;

// Peek the value (read without tracking)
console.log(counter.peek()); 

// Cleanup the atom
counter.dispose();
```

### Properties and Methods

- `value`: A getter/setter for the atom's state. Accessing the getter registers the atom as a dependency in the current reactive context. The setter updates the value and schedules notifications for subscribers if the value has changed.
- `peek(): T`: Returns the current value without registering a dependency.
- `dispose(): void`: Disposes of the atom. It clears all subscribers and internal state. Accessing or modifying a disposed atom will throw an error.

### Options

- `name`: (Optional) A string used for debugging and traceability.
- `sync`: (Default: `false`) If `true`, updates are flushed synchronously, bypassing the microtask batching system.
- `equal`: `(a: T, b: T) => boolean`. A custom equality function. If it returns `true`, the update is ignored and no notifications are sent. Defaults to `Object.is`.

---

## `computed<T>(fn: () => T | Promise<T>, options?: ComputedOptions)`

Creates a derived reactive node that automatically updates when its dependencies change.

### Key Characteristics

- **Lazy**: Computations are deferred until the `value` is accessed or required by an active effect.
- **Cached**: The result is cached and only re-evaluated if a dependency has changed.
- **Asynchronous Support**: Handles `Promise` return values natively, managing lifecycle states (pending, resolved, rejected).

### Example

```typescript
const count = atom(1);
const double = computed(() => count.value * 2);

console.log(double.value); // 2
```

### Properties and Methods

- `value`: Returns the current computed value. If dependencies are stale, it triggers a re-computation.
- `state`: Returns the current `AsyncState` (`'idle'`, `'pending'`, `'resolved'`, or `'rejected'`).
- `hasError`: A boolean indicating if the computation or any of its dependencies failed.
- `isValid`: A shortcut for `!hasError`.
- `errors`: A read-only array containing all errors collected from the local dependency sub-graph.
- `lastError`: The specific error thrown by this node's computation, if any.
- `isPending`: Boolean indicating if an asynchronous computation is currently in progress.
- `isResolved`: Boolean indicating if the computation has successfully resolved.
- `peek(): T`: Returns the cached value without triggering dependency tracking or re-computation.
- `invalidate(): void`: Forces the node to be marked as dirty, ensuring a re-computation on the next access.
- `dispose(): void`: Disposes of the computed atom and its dependency links.

### Async Example

```typescript
const userId = atom(123);

const userData = computed(async () => {
  const response = await fetch(`/api/users/${userId.value}`);
  return response.json();
}, { defaultValue: { loading: true } });

// Accessing userData.value returns the resolved value or the defaultValue if pending.
```

> [!IMPORTANT]
> **Async Dependency Tracking**: Only dependencies accessed **before** the first `await` are tracked. Dependencies accessed after an `await` will return their current value but will not trigger re-evaluations when they change.

### Options

- `name`: (Optional) A string for debugging.
- `equal`: Custom equality check for the computed result.
- `defaultValue`: Initial value returned while an asynchronous computation is pending.
- `lazy`: (Default: `true`) If `false`, the computation runs immediately upon creation.
- `onError`: `(error: Error) => void`. Callback executed when the computation fails.

---

## `effect(fn: () => void | CleanupFn | Promise<void | CleanupFn>, options?: EffectOptions)`

Starts a side effect that executes immediately and re-runs whenever its dependencies change.

### Usage

Effects are intended for side effects such as DOM manipulation, network requests, or integration with external libraries.

### Example

```typescript
const handle = effect(() => {
  const currentCount = count.value;
  document.title = `Count: ${currentCount}`;

  return () => {
    console.log(`Cleaning up for count ${currentCount}`);
  };
});

// Stop the effect
handle.dispose();
```

### Properties and Methods

`effect()` returns an `EffectObject`:

- `dispose()`: Stops the effect and executes the cleanup function.
- `run()`: Manually triggers the effect execution, even if dependencies haven't changed.
- `isDisposed`: Boolean indicating if the effect has been stopped.
- `isExecuting`: Boolean indicating if the effect logic is currently running.
- `executionCount`: The total number of times the effect has executed.

### Options

- `name`: (Optional) A string for debugging.
- `sync`: (Default: `false`) If `true`, the effect runs synchronously when dependencies change, instead of being batched.
- `onError`: `(error: unknown) => void`. Custom error handler.
- `maxExecutionsPerFlush`: (Default: `100`) Maximum executions allowed for this specific effect within a single flush cycle to prevent infinite loops.

---

## `batch<T>(fn: () => T): T`

Groups multiple state updates into a single notification cycle.

Updates to atoms inside the `batch` block are coalesced. Effects and computed values are deferred until the batch completes, ensuring they only run once with the final state.

- **Nesting**: Supports nested batches. The flush occurs only after the outermost batch ends.
- **Atomicity**: State changes are committed even if the callback throws an error.

---

## `aeNextTick(fn?: () => void): Promise<void>`

Returns a promise that resolves after the next scheduler flush.

This is the recommended method to wait for all asynchronous effects to settle and for the system to reach a consistent state, particularly useful in testing environments.

---

## `untracked<T>(fn: () => T): T`

Executes a function without registering dependencies. Any reactive reads inside the callback will not cause the enclosing `effect` or `computed` to re-run.

---

## `AsyncState`

An exported object representing the possible states of an asynchronous computed atom:

- `AsyncState.IDLE`: 'idle'
- `AsyncState.PENDING`: 'pending'
- `AsyncState.RESOLVED`: 'resolved'
- `AsyncState.REJECTED`: 'rejected'

---

## Error Handling

The library utilizes a structured error hierarchy for identifying and recovering from issues within the reactive graph.

### `AtomError`

The base class for all library-specific errors.

- `message`: Description of the error.
- `cause`: The underlying error or value that triggered the failure.
- `recoverable`: Boolean indicating if the system can recover if dependencies change.
- `code`: Machine-readable error code (e.g., `ERR_CIRCULAR_DEP`).

### Specialized Errors

- `ComputedError`: Errors occurring during computed value evaluation.
- `EffectError`: Errors occurring during effect execution or cleanup.
- `SchedulerError`: Errors from the internal execution engine (e.g., infinite loop detection).

---

## Lens & Structural Sharing

Lenses allow for the creation of reactive "views" into specific parts of an object-based atom.

### `atomLens<T, P>(atom: WritableAtom<T>, path: P)`

Creates a writable virtual atom pointing to a dot-path within a source atom. It uses structural sharing to ensure that only modified paths are updated, preserving reference equality for unrelated branches.

- **Path Resolution Engine**: Supports fully typed dot-paths for deep object structures, including arrays (`user.items.0.name`) and open-ended dictionaries (`Record<string, T>`).
- **Flexible Typing**: The setter and subscription callbacks accept broader types (`unknown`) to accommodate structural updates and dynamic keys.

### `lensFor(atom)`

A factory utility for creating multiple lenses bound to the same source atom.

---

## Debugging Utilities

The `runtimeDebug` object (exported from the core) provides tools for inspecting the reactive graph. In production, these are typically no-op functions unless explicitly enabled.

- `dumpGraph()`: Returns metadata for all currently active reactive nodes.
- `trackUpdate(id, name)`: Increments the update count for a node (used for loop detection).

### Global Debug Toggle

Debug features can be enabled at runtime by setting `window.__ATOM_DEBUG__ = true` or `sessionStorage.setItem('__ATOM_DEBUG__', 'true')` before the library script is evaluated.

---

## Internal Buffers (Advanced)

The library uses specialized buffers (`SlotBuffer`, `DepSlotBuffer`) for high-performance dependency and subscriber management. While primarily internal, they are exported for advanced use cases and testing.

### `SlotBuffer<T>`

A hybrid buffer using Small Vector Optimization (SVO).

- `length`: The number of active (non-null) items in the buffer.
- `capacity`: The highest physical index occupied plus one.
- `push(item: T): number`: Adds an item to the buffer, reusing holes if possible. Returns the index.
- `at(index: number): T | null`: Returns the item at the specified index.
- `remove(item: T): boolean`: Removes an item and leaves a hole for future reuse.
- `compact(): void`: Eliminates all internal holes and resets physical boundaries.

### `DepSlotBuffer`

A specialized `SlotBuffer` for `DependencyLink` objects, adding a Map-based fallback for $O(1)$ lookups when the collection grows large (> 32 items).
