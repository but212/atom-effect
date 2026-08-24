# Onboarding Guide

This guide introduces the core concepts, mental model, and standard patterns of the `@but212/atom-effect` reactive engine. It is intended to help developers understand how to architect applications using the library's primitives.

## Mental Model

The reactive system in `@but212/atom-effect` operates on a deterministic push-pull graph, conceptually similar to a spreadsheet:

- **Atoms**: Source cells containing raw data (inputs).
- **Computeds**: Derived cells with formulas that automatically re-evaluate based on their inputs.
- **Effects**: Observers that perform side-effects (e.g., DOM updates, network requests) when their dependencies change.

```text
  [Atom A]  ──┐
              ├──▶  [Computed C]  ──▶  [Effect (Side-effect)]
  [Atom B]  ──┘
```

Dependency tracking is implicit and synchronous. Reading a reactive value (`.value`) inside a `computed` or `effect` registers a dependency, ensuring the node updates when the source changes.

---

## Core Primitives

### 1. `atom(initialValue, options?)`

Atoms are the primary container for mutable state.

```typescript
import { atom } from '@but212/atom-effect';

const count = atom(0);

// Reading the value (registers a dependency in a reactive context)
console.log(count.value);

// Updating the value (schedules notifications for subscribers)
count.value = 5;

// Reading without registering a dependency
console.log(count.peek());

// Releasing resources
count.dispose();
```

### 2. `computed(computationCallback, options?)`

Computeds are read-only nodes that derive their state from other reactive nodes.

```typescript
import { atom, computed } from '@but212/atom-effect';

const price = atom(100);
const tax = atom(0.1);
const total = computed(() => price.value * (1 + tax.value));

console.log(total.value); // 110 (Evaluated lazily upon access)
```

**Key Characteristics**:

- **Lazy Evaluation**: The computation executes only when the value is accessed.
- **Caching**: Results are cached. Re-evaluation occurs only if upstream dependencies have changed.
- **Async Support**: Computeds can return a `Promise`. An explicit `defaultValue` is required to provide a synchronous state while the Promise is pending.
- **Disposal**: `dispose()` releases executable computation state. `.peek()` intentionally keeps returning the last cached value, while `.value` remains invalid after disposal.

### 3. `effect(effectCallback, options?)`

Effects execute side-effects in response to state changes.

```typescript
import { atom, effect } from '@but212/atom-effect';

const name = atom('Developer');

const handle = effect(() => {
  console.log(`Hello, ${name.value}`);

  // Optional cleanup function executed before the next run or upon disposal
  return () => console.log('Cleaning up...');
});

name.value = 'User';
// Console: "Cleaning up..." -> "Hello, User"

handle.dispose();
```

If an effect run returns a cleanup asynchronously, starting a newer run invalidates the older cleanup session. A stale promise cannot install cleanup over the newer run.

---

## Dependency Tracking

Tracking occurs synchronously when a `.value` property is accessed within a `computed` or `effect` execution context.

### Dynamic Graph

The dependency graph is dynamic. Only branches executed during the current evaluation pass are tracked.

```typescript
const show = atom(true);
const a = atom(1);
const b = atom(2);

const result = computed(() => {
  return show.value ? a.value : b.value;
});
// If `show.value` is true, changes to `b` will not trigger a re-evaluation.
```

### Untracked Reads

To access a value without establishing a reactive dependency, use `.peek()` on an atom or wrap the execution block in `untracked`.

```typescript
import { untracked } from '@but212/atom-effect';

effect(() => {
  // `a.value` triggers the effect, `b.value` does not.
  const aVal = a.value;
  const bVal = untracked(() => b.value); 
});
```

---

## Scheduling and Batching

### Microtask Flush

By default, the scheduler coalesces multiple state changes into a single asynchronous microtask cycle. This prevents redundant executions of computeds and effects during synchronous operations.

### Atomic Updates with `batch()`

The `batch()` utility groups multiple synchronous updates into a single atomic transaction.

```typescript
import { atom, batch } from '@but212/atom-effect';

const x = atom(0);
const y = atom(0);

batch(() => {
  x.value = 1;
  y.value = 2;
  // Downstream effects are deferred until the batch block completes.
});
```

---

## Asynchronous Operations

The library supports asynchronous data fetching via `computed`.

**Constraint: Synchronous Tracking**
Dependency tracking is strictly synchronous. You must read all required reactive values before the first `await` keyword in an async computed.

```typescript
const userId = atom(123);

const userData = computed(async () => {
  // CORRECT: Read dependencies synchronously before awaiting
  const currentId = userId.value; 
  
  const response = await fetch(`/api/user/${currentId}`);
  return response.json();
}, { defaultValue: null });
```

---

## Error Handling

### Error Propagation

Errors thrown during a computed's evaluation are caught and stored. The node transitions to an error state (`hasError: true`).

If a node in an error state is accessed, it will propagate the error by throwing a `ComputedError`, unless a `defaultValue` was provided during initialization.

### Error Inspection

You can inspect errors without triggering exceptions by using the `.hasError`, `.lastError`, or `.errors` properties on a computed node.

---

## State Composition

For complex applications, utilities are provided to compose and flatten state structures.

### `mergeAtoms` (Read-only)

Combines multiple atoms or computeds into a single read-only computed node with a flattened object structure.

```typescript
import { mergeAtoms } from '@but212/atom-effect';

const settings = atom({ theme: 'dark' });
const user = atom({ name: 'Alice' });

const state = mergeAtoms(settings, user); 
// state.value -> { theme: 'dark', name: 'Alice' }
```

### `mergeLenses` (Two-way Synchronization)

Unifies multiple writable lenses into a single writable atom, allowing coordinated updates.

```typescript
import { atom, mergeLenses, atomLens } from '@but212/atom-effect';

const user = atom({ profile: { name: 'Alice' } });
const settings = atom({ config: { theme: 'dark' } });

const combined = mergeLenses(atomLens(user, 'profile'), atomLens(settings, 'config'));
combined.value = { name: 'Bob', theme: 'light' };
// user.value.profile -> { name: 'Bob', theme: 'light' }
// settings.value.config -> { name: 'Bob', theme: 'light' }
```

---

## Standard Practices

1. **Resource Disposal**: Always call `.dispose()` on effects and atoms when they are no longer needed (e.g., component unmount) to prevent memory leaks.
2. **Deterministic Computations**: Computed functions must be pure. Modifying atoms or performing side effects inside a computed function will lead to unpredictable behavior and potential infinite loops.
3. **Execution Limits**: The scheduler implements a maximum execution limit per flush cycle (default 100 per effect) to prevent the main thread from hanging due to circular updates.
4. **Testing Synchronization**: Use `await aeNextTick()` in test environments to ensure the scheduler has finished flushing pending microtasks before making assertions.
