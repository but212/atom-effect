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
- `errors`: A read-only array containing all errors collected from the local dependency sub-graph. It uses an iterative traversal strategy to ensure stability and completeness even in deep dependency chains.
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
> **Async Consistency**: Asynchronous computations resolve and update their state (`value`, `isPending`, `isResolved`) within the microtask following the settlement of the underlying Promise.
>
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
- `isNotifying`: Boolean indicating if the effect is currently propagating updates to its own subscribers.
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
- **Return Value**: Returns the result of the provided function `fn`.

---

## `runInFlushScope<T>(fn: () => T): T | undefined`

Executes a function while the scheduler is locked for a new execution pass. This utility groups updates to be processed within a single, atomic flush cycle. Returns the result of `fn`, or `undefined` if the flush could not be started (e.g., already in progress).

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

> [!IMPORTANT]
> **ES2022+ Requirement**: Starting with version 0.33.0, the library targets ES2022. It utilizes modern JavaScript features such as private class fields (`#`) for internal state encapsulation.
>
> **Breaking Change**: Instance methods like `AtomError.getChain()` and `AtomError.toJSON()` have been removed. Use the standalone `getErrorChain()` and `serializeError()` utilities instead for improved tree-shaking.

### `AtomError`

The base class for all library-specific errors.

- `_tag`: String discriminator for cross-realm identification (e.g., `'AtomError'`, `'ComputedError'`).
- `message`: Description of the error.
- `cause`: The underlying error or value that triggered the failure.
- `recoverable`: Boolean indicating if the system can recover if dependencies change.
- `code`: Machine-readable error code (e.g., `ERR_CIRCULAR_DEP`).

### Specialized Errors

- `ComputedError`: Errors occurring during computed value evaluation.
- `EffectError`: Errors occurring during effect execution or cleanup.
- `SchedulerError`: Errors from the internal execution engine (e.g., infinite loop detection).

### Utility Functions

- `getErrorChain(error: unknown): Array<unknown>`: Traverses the `.cause` chain to reconstruct the full error trace. Handles circular references.
- `serializeError(error: unknown): AtomErrorJSON | unknown`: Converts an error into a plain JSON-serializable object. Replaces circular references with a sentinel object.

---

## Lens & Structural Sharing

Lenses allow for the creation of reactive "views" into specific parts of an object-based atom.

### `atomLens<T, P>(atom: WritableAtom<T>, path: P)`

Creates a writable virtual atom pointing to a dot-path within a source atom. It uses structural sharing to ensure that only modified paths are updated, preserving reference equality for unrelated branches.

- **Path Resolution Engine**: Supports fully typed dot-paths for deep object structures, including arrays (`user.items.0.name`) and open-ended dictionaries (`Record<string, T>`).
- **Supported Types**: In addition to plain objects and arrays, lenses now support **`Map`**, **`Set`**, and **custom Class instances**.
- **Prototype Preservation**: Updates to class instances through a lens preserve the original prototype. This ensures that `instanceof` checks and class methods remain valid after updates.
- **Optimization**: Multiple lenses pointing to the same source atom now share a single subscription, minimizing reactive overhead.

#### Example: Classes and Maps

```typescript
class User {
  constructor(public name: string) {}
  greet() { return `Hi, ${this.name}`; }
}

const store = atom({ 
  user: new User('Alice'),
  metadata: new Map([['id', '123']])
});

// Class property lens
const nameLens = atomLens(store, 'user.name');
nameLens.value = 'Bob';
console.log(store.value.user instanceof User); // true
console.log(store.value.user.greet()); // "Hi, Bob"

// Map lens (using dot-notation for keys)
const idLens = atomLens(store, 'metadata.id');
console.log(idLens.value); // "123"
```

### `lensFor(atom)`

A factory utility for creating multiple lenses bound to the same source atom.

---

## State Composition

Utilities for combining multiple reactive nodes into unified object structures.

### `mergeAtoms(...atoms)`

Combines multiple object-based atoms or computeds into a single read-only computed atom with a flattened type.

- **Flattening**: If source atoms have overlapping keys, the last one wins.
- **Reactivity**: The merged atom automatically updates when any of the source nodes change.

```typescript
const a = atom({ x: 1 });
const b = atom({ y: 2 });
const combined = mergeAtoms(a, b);

console.log(combined.value); // { x: 1, y: 2 }
```

### `mergeLenses(...lenses)`

Merges multiple writable lenses into a single unified writable atom (lens) with a flattened type.

- **Two-way Binding**: Updates to the merged object's properties are propagated back to the respective source atoms.
- **Noise Filtering**: Uses deep equality checking to prevent redundant notifications when the merged result hasn't effectively changed.
- **Subscription Sharing**: Efficiently manages underlying subscriptions, ensuring source atoms are only tracked when the merged lens is active.

```typescript
const user = atom({ profile: { name: 'Alice' }, settings: { age: 25 } });
const nameL = atomLens(user, 'profile');
const ageL = atomLens(user, 'settings');

const combined = mergeLenses(nameL, ageL);

// Read merged state
console.log(combined.value); // { name: 'Alice', age: 25 }

// Unified write
combined.value = { name: 'Bob', age: 30 };
console.log(user.value.profile.name); // "Bob"
```

---

## Debugging Utilities

The `debug` object (exported from the core) provides tools for inspecting the reactive graph. In production, these are replaced by a high-performance static controller that ensures zero runtime overhead.

### Automatic Naming

Reactive nodes are automatically assigned human-readable identities based on their type:

- **Atoms**: `atom_{id}`
- **Computeds**: `calc_{id}`
- **Effects**: `fx_{id}`

If a `name` option is provided during node creation, it will be used as the primary identifier.

- `dumpGraph()`: Returns metadata for all currently active reactive nodes.
- `trackUpdate(id, name)`: Increments the update count for a node (used for loop detection).

### Global Debug Toggle

Debug features can be enabled at runtime by setting `window.__ATOM_DEBUG__ = true` or `sessionStorage.setItem('__ATOM_DEBUG__', 'true')` before the library script is evaluated.

---

## Internal Buffers (Advanced)

The library uses specialized buffers (`SlotBuffer`) and state management objects (`DepBufferState`) for high-performance dependency and subscriber management. While primarily internal, they are exported for advanced use cases and testing.

### `SlotBuffer<T>`

A high-performance container using a 4-bit mask for "fast-lane" slot management and an overflow array for unbounded capacity. It is optimized for V8 hidden class stability.

- `length`: The number of active (non-null) items in the buffer.
- `capacity`: The highest physical index occupied plus one.
- `push(item: T): number`: Adds an item to the buffer, reusing holes if possible. Returns the index.
- `at(index: number): T | null`: Returns the item at the specified index.
- `remove(item: T): boolean`: Removes an item and leaves a hole for future reuse.
- `has(item: T): boolean`: Returns true if the buffer contains the item.
- `forEach(fn: (item: T) => void): void`: Executes a callback for every non-null entry.
- `compact(): void`: Eliminates all internal holes and resets physical boundaries.
- `clear(): void`: Resets the buffer to an empty state.

### `DependencyBuffer`

The internal state management for dependency tracking is now implemented as an encapsulated **`DependencyBuffer`** class. It features:

- **Private Encapsulation**: Uses ES2022 private fields (`#`) to isolate reactive links and lookup indexing from external access.
- **Dynamic Indexing**: Employs an `Indexer` interface that automatically transitions from linear scans to a `Map`-based lookup when the dependency count exceeds 32.
- **Lifecycle Logic**: Encapsulates reconciliation logic (`claimExisting`, `insertNew`) and memory-safe truncation within class methods.
