# Onboarding Guide

This guide is designed to help developers quickly understand the core concepts, mental model, and common patterns of `@but212/atom-effect`.

## Mental Model

The reactive system in `@but212/atom-effect` can be compared to a **spreadsheet**:

- **Atoms** represent cells containing raw data (inputs).
- **Computeds** represent cells with formulas that automatically update based on their inputs.
- **Effects** represent observers that perform actions (such as updating the DOM or logging) whenever the relevant cells change.

```text
  [Atom A]  ──┐
              ├──▶  [Computed C = A + B]  ──▶  [Effect: Update UI]
  [Atom B]  ──┘
```

Dependency tracking is handled **automatically**. By reading a reactive value inside a `computed` or `effect` function, the system registers that relationship without requiring manual declaration.

---

## Core Primitives

### 1. `atom(initialValue, options?)`

Atoms are the primary source of state. They are writable and notify subscribers when their value changes.

```typescript
import { atom } from '@but212/atom-effect';

const count = atom(0);

// Accessing the value (tracks dependency if inside effect/computed)
console.log(count.value);

// Updating the value (triggers notifications)
count.value = 5;

// Reading without tracking
console.log(count.peek());

// Explicitly cleaning up resources
count.dispose();
```

**Note**: By default, atom updates are batched using microtasks. Multiple updates in the same synchronous block result in a single notification cycle.

### 2. `computed(fn, options?)`

Computeds are read-only nodes that derive their state from other atoms or computeds.

```typescript
const price = atom(100);
const tax = atom(0.1);
const total = computed(() => price.value * (1 + tax.value));

console.log(total.value); // 110 (Calculated lazily)
```

**Key Characteristics**:

- **Lazy Evaluation**: The calculation only runs when the `.value` is accessed.
- **Caching**: The result is cached and only re-calculated if dependencies change.
- **Async Support**: Can return a `Promise`. Use the `defaultValue` option to provide a value while the promise is pending.

### 3. `effect(fn, options?)`

Effects are used to perform side effects in response to state changes.

```typescript
const name = atom('Developer');

const handle = effect(() => {
  console.log(`Hello, ${name.value}`);

  // Optional cleanup function called before re-execution or disposal
  return () => console.log('Cleaning up...');
});

name.value = 'User';
// Console logs: "Cleaning up...", then "Hello, User"
```

---

## Scheduling and Batching

### Microtask Batching

The scheduler uses `queueMicrotask` by default to coalesce multiple state changes into a single notification flush. This prevents redundant executions.

### Explicit Batching with `batch()`

The `batch()` utility allows you to group multiple updates and ensure a synchronous flush of all affected effects and computeds immediately after the batch callback finishes.

```typescript
import { batch } from '@but212/atom-effect';

batch(() => {
  atomA.value = 1;
  atomB.value = 2;
  // Notifications are deferred until the end of this block
});
// Synchronous flush occurs here
```

---

## Dependency Tracking

Tracking occurs whenever a `.value` property is accessed within a tracking context (like an `effect` or `computed`).

### Dynamic Dependencies

The dependency graph is dynamic. If a computation branches, it only tracks the dependencies it actually accesses during the last execution.

```typescript
const show = atom(true);
const a = atom(1);
const b = atom(2);

const result = computed(() => {
  return show.value ? a.value : b.value;
});
// If show.value is true, only 'show' and 'a' are tracked.
```

### Bypassing Tracking

Use `.peek()` on an atom or wrap logic in `untracked(() => ...)` to read reactive state without creating a dependency.

---

## Asynchronous Operations

Async computeds are natively supported. It is important to remember that **dependency tracking is synchronous**. Always read dependencies before the first `await` keyword.

```typescript
const data = computed(async () => {
  const currentId = userId.value; // Tracked
  const response = await fetch(`/api/user/${currentId}`);
  return response.json();
}, { defaultValue: null });
```

---

## Error Handling

### Computed Nodes

Computeds catch errors during evaluation. You can inspect them using `.hasError`, `.lastError`, or `.errors`. Providing a `defaultValue` allows the system to return that value instead of throwing when the node is accessed in an error state.

### Effect Nodes

Errors in effects are caught by the scheduler. You can provide an `onError` callback in the effect options to handle these errors (e.g., for logging to a service).

---

## State Composition

As your application grows, you may need to combine multiple atoms into a single view or manage related pieces of state together.

### `mergeAtoms` (Read-only)

Combine multiple atoms into a single read-only object.

```typescript
const settings = atom({ theme: 'dark' });
const user = atom({ name: 'Alice' });
const state = mergeAtoms(settings, user); 
// state.value -> { theme: 'dark', name: 'Alice' }
```

### `mergeLenses` (Two-way)

Unify multiple writable lenses into a single writable atom. Perfect for form handling or unified state management.

```typescript
const combined = mergeLenses(themeLens, nameLens);
combined.value = { theme: 'light', name: 'Bob' }; // Updates both source atoms
```

---

## Best Practices and Considerations

1. **Manual Disposal**: Effects and atoms should be disposed of when they are no longer needed to prevent memory leaks, especially in component-based architectures.
2. **Purity in Computeds**: Computed functions should be pure and free of side effects. Avoid modifying atoms inside a computed function, as this can lead to infinite loops.
3. **Circular Dependencies**: The library detects circular dependency chains and throws an error to maintain graph integrity.
4. **`aeNextTick`**: Use `await aeNextTick()` in tests or complex logic to wait for the scheduler to finish its current flush cycle.

---

## Project Structure

For contributors, here is an overview of the core package layout:

- `packages/core/src/core/`: Reactive primitives (atoms, computeds, effects) and core engine logic.
- `packages/core/src/constants/`: Reusable state flags, environment settings, and branding symbols.
- `packages/core/src/types/`: Partitioned TypeScript interfaces (reactive, internal, API, scheduler).
- `packages/core/src/utils/`: Utility functions, debug controllers, and the error hierarchy.
