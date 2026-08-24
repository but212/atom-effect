# API Reference

This document provides a comprehensive reference for the core reactive primitives of `@but212/atom-effect`. It details the behavior, configuration options, and technical constraints of the library's public API.

---

## `atom<T>(initialValue: T, options?: AtomOptions)`

Creates a mutable state container, known as an **atom**. Atoms serve as the primary source nodes in the reactive dependency graph.

### When to use

- Managing primary application state (e.g., user inputs, configuration, server data).
- When state needs to be updated manually via direct assignment.

### Example

```typescript
import { atom } from '@but212/atom-effect';

const counter = atom(0);

// Read the value (registers a dependency if inside a reactive context)
console.log(counter.value); 

// Update the value (notifies downstream subscribers)
counter.value = 1;

// Peek the value (read without registering a dependency)
console.log(counter.peek()); 

// Subscribe to changes
const unsubscribeCallback = counter.subscribe((next, prev) => {
  console.log(`Changed from ${prev} to ${next}`);
});

// Cleanup
counter.dispose();
```

### Properties and Methods

- `value`: A getter/setter for the internal state. Accessing the getter registers the atom as a dependency in the current reactive context. The setter updates the value and schedules notifications if the new value fails an equality check (`Object.is` by default).
- `peek(): T`: Returns the current value without registering a dependency. Recommended for one-time reads or initialization logic.
- `subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void`: Attaches a listener that executes whenever the value changes. Returns an unsubscription function. The callback parameters are optional as certain transition states may propagate `undefined`. Low-level scheduler integrations can provide a `Subscriber` object implementing the `execute(): void` interface.
- `subscriberCount(): number`: Returns the number of active subscribers. Primarily used for diagnostics.
- `dispose(): void`: Permanently disables the atom, clearing all subscribers and releasing the stored value for garbage collection. After disposal, reading `value` or `peek()` returns `undefined` (regardless of the declared type parameter `T`) and setting `value` is a no-op — check `isDisposed` before relying on reads.
- `isDisposed`: A read-only boolean indicating if the atom has been disposed. (Note: Excluded from the public `ReadonlyAtom`/`WritableAtom` TypeScript interfaces, but accessible on the runtime instance).

### Options

- `name`: (Optional) A string identifier used for debugging and traceability in the reactive graph.
- `sync`: (Default: `false`) If `true`, updates are delivered synchronously, bypassing the microtask batching system.
- `equal`: `(a: T, b: T) => boolean`. A custom equality function. If it returns `true`, the update is ignored and no notifications are sent.

---

## `computed` Overloads

```typescript
export function computed<T>(
  computationCallback: () => Promise<T>,
  options: ComputedOptions<T> & { defaultValue: T }
): ComputedAtom<T>;

export function computed<T>(
  computationCallback: () => Promise<T>,
  options?: ComputedOptions<T>
): ComputedAtom<T>;

export function computed<T>(
  computationCallback: () => T,
  options?: ComputedOptions<T>
): ComputedAtom<T>;
```

Creates a derived reactive node that automatically re-calculates its value when its dependencies change.

### Key Characteristics

- **Lazy Evaluation**: Computations are deferred until the `value` is accessed or required by an active effect.
- **Caching**: The result is cached and only re-evaluated if an upstream dependency has changed its version.
- **Asynchronous Lifecycle**: Supports `Promise` return values, managing states such as `pending`, `resolved`, and `rejected`.

### Example

```typescript
const count = atom(1);
const double = computed(() => count.value * 2);

console.log(double.value); // 2
```

### Properties and Methods

- `value`: Returns the current computed value. If dependencies are stale, it triggers a re-computation.
- `state`: Returns the current `AsyncState` (`'idle'`, `'pending'`, `'resolved'`, or `'rejected'`).
- `hasError`: Indicates if the computation or any node in its dependency sub-graph is in an error state.
- `isValid`: A shortcut for `!hasError`.
- `errors`: A read-only array containing all errors collected from the local dependency sub-graph.
- `lastError`: The specific error thrown by this node's computation, if any.
- `isPending`: True if an asynchronous computation is currently in progress.
- `isResolved`: True if the node has successfully resolved to a value at least once.
- `isRejected`: True if the most recent computation was rejected (async or sync).
- `isDisposed`: True if the node has been permanently disposed. (Note: Included in the public `ComputedAtom` TypeScript interface).
- `peek(): T`: Returns the cached value without triggering dependency tracking or re-computation.
- `invalidate(): void`: Forces the node to be marked as dirty, ensuring re-computation on the next access.
- `subscribe(listener: ((newValue?: T, oldValue?: T) => void) | Subscriber): () => void`: Attaches a listener to the computation's results. Parameters are optional as they will receive `undefined` when the computed node transitions to a dirty or async pending state. Low-level integrations can also pass a `Subscriber` object.
- `dispose(): void`: Disconnects the node from all dependencies and clears its subscriber list.

### Async Support

Asynchronous computations can be defined by returning a `Promise`. The returned node is typed as `ComputedAtom<T>` (not `ComputedAtom<Promise<T>>`), so accessing `.value` returns the resolved value of type `T`.

- **With `defaultValue` (Recommended)**: The `defaultValue` is returned while the Promise is pending.

  ```typescript
  const userId = atom(123);

  const userData = computed(async () => {
    const response = await fetch(`/api/users/${userId.value}`);
    return response.json();
  }, { defaultValue: { loading: true } });
  ```

- **Without `defaultValue`**: Accessing `.value` while the Promise is pending will throw a `ComputedError`. Once resolved, the value can be read normally.

  ```typescript
  const p = computed(async () => {
    await sleep(10);
    return 1;
  });

  p.value; // ❌ Throws ComputedError: Async computation pending with no default value
  
  // After resolving...
  p.value; // ➔ 1 (Successful read)
  ```

> [!IMPORTANT]
> **Async Dependency Tracking**: Only dependencies accessed **before** the first `await` are tracked. Dependencies accessed after an `await` will return their current value but will not trigger re-evaluations when they change.

### Options

- `name`: (Optional) A debugging identifier.
- `equal`: Custom equality check for the result to suppress redundant downstream updates.
- `defaultValue`: Recommended fallback value for async computations; returned while a Promise is pending. If provided, it also acts as an error fallback: any computation failures (synchronous or asynchronous) or circular references will be caught, and the `defaultValue` will be returned instead of throwing a `ComputedError`. If omitted, accessing `.value` during pending or error/circular states throws a `ComputedError`.
- `lazy`: (Default: `true`) If `false`, the computation runs immediately upon creation.
- `onError`: `(error: Error) => void`. Callback executed when the computation fails.

---

## `effect(effectCallback: EffectFunction, options?: EffectOptions)`

### `EffectFunction` and `EffectCleanup` Types

```typescript
type EffectCleanup = () => void;
type EffectFunction = () => (void | EffectCleanup) | Promise<void | EffectCleanup>;
```

Starts a side effect that executes immediately and re-runs whenever its dependencies change.

### When to use

- Synchronizing state with external systems (e.g., DOM manipulation, API calls).
- Managing resources like timers or global event listeners.

### Example

```typescript
const handle = effect(() => {
  const currentCount = count.value;
  document.title = `Count: ${currentCount}`;

  // Optional cleanup function
  return () => {
    console.log(`Cleaning up for count ${currentCount}`);
  };
});

// Stop the effect
handle.dispose();
```

### Properties and Methods

`effect()` returns an `EffectObject`:

- `run()`: Manually triggers the effect execution, regardless of dependency status.
- `dispose()`: Stops the effect and executes any existing cleanup handle.
- `isDisposed`: Boolean indicating if the effect has been stopped.
- `isExecuting`: Boolean indicating if the effect logic is currently running.
- `executionCount`: The total number of times the effect has executed.

### Options

- `name`: (Optional) A debugging identifier.
- `sync`: (Default: `false`) If `true`, the effect runs synchronously when dependencies change.
- `onError`: `(error: unknown) => void`. Custom error handler for execution or cleanup failures.
- `maxExecutionsPerFlush`: (Default: `100`) Maximum executions allowed for this effect within a single flush cycle to prevent infinite loops.
- `maxExecutionsPerSecond`: (Development only) Threshold for detecting unintentional high-frequency updates.

---

## `batch<T>(fn: () => T): T`

Groups multiple state updates into a single notification cycle.

- **Coalescing**: Updates to atoms inside the `batch` block are grouped. Downstream effects and computations are deferred until the batch completes.
- **Nesting**: Supports nested batches. The final flush occurs after the outermost batch ends.
- **Atomicity**: State changes are committed even if the provided function throws an error.

---

## `aeNextTick(nextTickCallback?: () => void): Promise<void>`

Returns a promise that resolves after the next scheduler flush. Recommended for waiting for asynchronous effects to settle during testing.

---

## `globalScheduler`

The global scheduler instance. Provides low-level control over flush cycles, batching depth, and execution budgets.

> [!NOTE]
> The concrete `ReactiveScheduler` class and its `SchedulerState` interface are internal types and are not exported from the public entry point. The scheduler is exposed directly as the `globalScheduler` instance.
>
> For diagnostic graph dumps or inspecting active nodes, use [`runtimeDebug.dumpGraph()`](#debugging-utilities) instead of the scheduler.

---

## `untracked<T>(fn: () => T): T`

Executes a function without registering dependencies. Any reactive reads inside the callback will not cause the enclosing `effect` or `computed` to re-run.

---

## `AsyncState`

Exported constants representing the possible states of an asynchronous computed node:

- `AsyncState.IDLE`: `'idle'`
- `AsyncState.PENDING`: `'pending'`
- `AsyncState.RESOLVED`: `'resolved'`
- `AsyncState.REJECTED`: `'rejected'`

---

## Error Handling

The library utilizes a structured error hierarchy and provides utilities for error inspection.

### `AtomError`

The base class for library-specific errors.

- `message`: Description of the failure.
- `cause`: The underlying error or value that triggered the failure.
- `code`: Machine-readable error code (e.g., `ERR_CIRCULAR_DEP`).
- `recoverable`: Boolean indicating if the scheduler can attempt to retry the failed operation.

### Specialized Errors

- `ComputedError`: Errors occurring during computed value evaluation.
- `EffectError`: Errors occurring during effect execution or cleanup.
- `SchedulerError`: Errors from the execution engine (e.g., infinite loop detection).

### Utility Functions

- `getErrorChain(error: unknown): Array<unknown>`: Traverses the `.cause` chain to reconstruct the full error trace.
- `serializeError(error: unknown): AtomErrorJSON | unknown`: Converts an error into a JSON-serializable object, handling circular references.

---

## Lens & Structural Sharing

Lenses provide reactive, two-way views into specific paths of an object-based atom.

### `atomLens<T, P>(atom: WritableAtom<T>, path: P)`

Creates a writable virtual atom pointing to a dot-path within a source atom.

- **Structural Sharing**: Updates only clone the objects along the modified path, preserving reference equality for unrelated branches.
- **Path Support**: Supports dot-notation for deep objects, array indices (`users.0.name`), and `Map` keys. `Set` instances are treated as terminal values and do not support nested path traversal.
- **Prototype Preservation**: Updates to class instances preserve the original prototype and methods.

### `lensFor(atom)`

A factory utility for creating multiple lenses bound to the same source atom.

### `composeLens(lens, path)`

A semantic alias for creating a sub-lens from an existing lens.

---

## State Composition

### `mergeAtoms(...atoms)`

Combines multiple atoms or computed nodes into a single read-only computed atom with a flattened object type.

> [!IMPORTANT]
> **Object-based Nodes Only**: This utility is designed specifically for object-based nodes. Merging primitive-valued nodes (e.g., strings or numbers) will cause a type-mismatch discrepancy: the static TypeScript type resolves to the primitive type (e.g., `string`), but the runtime value returned is an index-keyed object (e.g., `{ '0': val1, '1': val2 }`).

### `mergeLenses(...lenses)`

Merges multiple writable lenses into a single unified writable atom.

> [!IMPORTANT]
> **Object-based Nodes Only**: This utility is designed specifically for object-based nodes. Merging primitive-valued nodes (e.g., strings or numbers) will cause a type-mismatch discrepancy: the static TypeScript type resolves to the primitive type (e.g., `string`), but the runtime value returned is an index-keyed object (e.g., `{ '0': val1, '1': val2 }`).

Please review the write propagation behavior outlined below to ensure correct state updates.

> [!WARNING]
> **Write Propagation Behavior**: When writing a new value to the merged lens (`merged.value = newVal`), the value is written in its entirety to each underlying lens (`lens.value = newVal`) within a single `batch`. The merged value is *not* partitioned or split by paths. Ensure that each underlying lens can accept the entire merged object structure or that target properties can handle the full value.

---

## Type Guards

The library provides several type guards to identify reactive nodes at runtime.

- `isAtom(node: unknown): node is ReadonlyAtom`: Returns true if the object is an atom.
- `isComputed(node: unknown): node is ComputedAtom`: Returns true if the object is a computed node.
- `isEffect(node: unknown): node is EffectObject`: Returns true if the object is an effect handle.
- `isWritable(node: unknown): node is WritableAtom`: Returns true if the node supports write operations.
- `isPromise<T = unknown>(value: unknown): value is PromiseLike<T>`: Returns true if the value is a Promise or a thenable object.

---

## Low-level Utilities

### `getPathValue(source, parts)`

Retrieves a value from a nested object structure using a dot-path (provided as an array of strings).

### `setDeepValue(obj, keys, index, value)`

Performs an immutable update at a specific path, returning a new object structure with structural sharing.

---

## Debugging Utilities

The `debug` object (exported as `runtimeDebug` in some contexts) provides tools for inspecting the reactive graph.

- `dumpGraph()`: Returns metadata for all currently active reactive nodes.
- `trackUpdate(id, name)`: Increments the update count for a node (internal use).
- **Automatic Naming**: Nodes are assigned IDs (e.g., `atom_1`, `calc_5`, `effect_3`) if no explicit name is provided.

---

## Internal Structures (Advanced)

### `SlotBuffer<T>`

A high-performance container optimized for V8 hidden class stability. It manages listeners and dependencies using a combination of inline slots and an overflow array.

### Dependency Buffers (`ReactiveDependencyTracker`)

The internal state management helper module and interfaces used for dependency tracking on nodes, featuring:

- **Lazy Indexing**: Transitions from linear scans to `Map`-based lookups for large dependency sets once a capacity threshold is exceeded.
- **Reconciliation**: Optimized logic for swapping and reusing existing subscriptions during re-evaluation to avoid redundant listeners.
