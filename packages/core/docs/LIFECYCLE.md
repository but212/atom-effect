# Core Node Lifecycle

This document outlines the lifecycle of reactive nodes (Atoms, Computeds, Effects) within the `@but212/atom-effect` core engine. Understanding this lifecycle is critical for managing memory, side effects, and application performance.

---

## The Push-Pull Lifecycle

The core engine employs a hybrid push-pull reactive system to balance immediate notifications with deferred computation.

### 1. Initialization

When a node is created (`atom()`, `computed()`, or `effect()`), it is registered with a unique monotonic `DependencyId`.

- **Why**: This identity is used internally for dependency tracking, diagnostic debugging, and preventing memory leaks via V8-optimized structural maps.

### 2. Dependency Tracking (Pull Phase)

Dependencies are established automatically and synchronously when a node's value is accessed within a tracking context (like an `effect` or `computed` callback).

- **Why**: Synchronous tracking ensures deterministic dependency graphs. Dependencies accessed after an `await` in an asynchronous computed are intentionally ignored to prevent memory leaks from stale contexts.

### 3. Notification (Push Phase)

When an Atom's value is mutated, it increments its internal version and immediately pushes a "dirty" signal to its direct subscribers.

- **Why**: Immediate push notifications allow the scheduler to batch updates efficiently without constantly polling the dependency graph.

### 4. Scheduling & Execution

Instead of evaluating `effect` and `computed` immediately upon an atom's mutation, they are scheduled for execution in a microtask.

- **Why**: Coalescing multiple state updates into a single microtask prevents redundant layout thrashing and computational overhead (e.g., updating `firstName` and `lastName` sequentially only triggers one full UI update).

---

## Memory Management & Disposal

Effective memory management in `@but212/atom-effect` relies on deterministic disposal and the garbage collector.

### Resource Disposal

All reactive nodes implement the `Disposable` interface via the `.dispose()` method.

- **Why**: While JS garbage collection handles unreferenced objects, reactive nodes maintain internal subscriber arrays (Slot Buffers) and Maps that create strong references. Calling `.dispose()` actively severs these links, releasing memory instantly.

```typescript
const count = atom(0);
const logger = effect(() => console.log(count.value));

// The effect must be disposed to remove its subscription to `count`
logger.dispose();
```

### Automatic Effect Cleanup

When an effect re-runs due to a dependency update, its previous cleanup function (if any was returned) is executed first.

- **Why**: This pattern (similar to React's `useEffect`) prevents side-effect accumulation, such as multiple event listeners or uncancelled HTTP requests.

```typescript
effect(() => {
  const handler = () => console.log(count.value);
  window.addEventListener('resize', handler);

  return () => {
    // This executes right before the effect re-runs, and upon disposal
    window.removeEventListener('resize', handler);
  };
});
```

### Asynchronous Computed Lifecycles

Async computations manage internal states (`pending`, `resolved`, `rejected`) and are locked into "sessions".

- **Why**: Session locking ensures that if an async computed triggers multiple times rapidly, only the result of the *latest* execution resolves the node, ignoring stale promises.

---

## Best Practices

1. **Always Dispose Terminal Nodes**: Effects are "sinks" that keep the graph alive. If an effect is tied to a temporary UI component, dispose of it when the component unmounts.
2. **Avoid Circular Dependencies**: Modifying an atom inside an effect that reads the same atom triggers infinite loops. The effect guards against this with `maxExecutionsPerFlush`, logging and returning an `EffectError` if the budget is exhausted.
3. **Use `aeNextTick()` in Tests**: Because state updates are scheduled in microtasks, always await the next tick before asserting changes in your test suites.
