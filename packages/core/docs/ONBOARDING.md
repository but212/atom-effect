# Onboarding Guide

This guide helps new developers understand `@but212/atom-effect` quickly: the mental model, key concepts, and common pitfalls.

## Mental Model

Think of your application state as a **spreadsheet**.

- **Atoms** are cells you type into manually.
- **Computed** values are cells with formulas — they update automatically when their inputs change.
- **Effects** are "watchers" that react to cell changes (e.g., updating the DOM, logging, sending requests).

```text
  [Atom A]  ──┐
              ├──▶  [Computed C = A + B]  ──▶  [Effect: update DOM]
  [Atom B]  ──┘
```

All dependency tracking happens **automatically** — you never declare relationships manually. Just read a value inside a `computed` or `effect`, and the library tracks it for you.

## Core Primitives

### 1. `atom(initialValue)` — Writable State

```typescript
import { atom } from '@but212/atom-effect';

const count = atom(0);

count.value;        // Read (tracked inside effect/computed)
count.peek();       // Read (never tracked)
count.value = 5;    // Write (notifies subscribers)
count.dispose();    // Cleanup
```

**Key behavior**: Writes are batched via microtask by default. Multiple writes in the same synchronous block are coalesced into one notification.

### 2. `computed(fn)` — Derived State

```typescript
import { atom, computed } from '@but212/atom-effect';

const price = atom(100);
const tax = atom(0.1);
const total = computed(() => price.value * (1 + tax.value));

total.value; // 110 — computed lazily on first read
price.value = 200;
total.value; // 220 — recomputed because `price` changed
```

**Key behavior**:

- **Lazy**: Does not compute until `.value` is read.
- **Cached**: Returns the same result if dependencies haven't changed.
- **Async-capable**: Can return a `Promise`. See [API Reference](./API.md) for `defaultValue` and async state tracking.

### 3. `effect(fn)` — Side Effects

```typescript
import { atom, effect } from '@but212/atom-effect';

const name = atom('World');

const effectHandle = effect(() => {
  console.log(`Hello, ${name.value}!`);
  // Optional cleanup function
  return () => console.log('Cleaning up...');
});
// Logs: "Hello, World!"

name.value = 'Alice';
// (after microtask) Logs: "Cleaning up..." then "Hello, Alice!"

effectHandle.dispose(); // Stop watching
```

**Key behavior**:

- Runs immediately on creation.
- Re-runs asynchronously (microtask) when dependencies change.
- Previous cleanup runs before each re-execution.

## Scheduling & Batching

### Default: Microtask Batching

By default, notifications are delivered via `queueMicrotask`. This means multiple writes in the same synchronous block are automatically coalesced:

```typescript
const a = atom(0);
effect(() => console.log(a.value)); // Logs: 0

a.value = 1;
a.value = 2;
a.value = 3;
// Effect runs once with value 3 (not three times)
```

### Explicit Batching with `batch()`

Use `batch()` when you need **synchronous flush** after updating multiple atoms:

```typescript
import { atom, batch } from '@but212/atom-effect';

const firstName = atom('');
const lastName = atom('');

batch(() => {
  firstName.value = 'John';
  lastName.value = 'Doe';
  // No effects run inside this block
});
// Effects flush synchronously here, seeing both updates at once
```

### Sync Mode

For latency-critical paths, atoms and effects support `sync: true`:

```typescript
const count = atom(0, { sync: true });
effect(() => console.log(count.value), { sync: true });

count.value = 1; // Effect runs immediately (no microtask delay)
```

## Dependency Tracking

### How It Works

When you read `.value` inside a `computed` or `effect`, the library records that dependency automatically using a **tracking context**.

```typescript
const a = atom(1);
const b = atom(2);
const show = atom(true);

const result = computed(() => {
  if (show.value) return a.value;  // tracks `show` and `a`
  return b.value;                   // tracks `show` and `b`
});
```

Dependencies are **dynamic** — they can change between runs. If `show` becomes `false`, the computed stops tracking `a` and starts tracking `b`.

### Reading Without Tracking

Use `peek()` or `untracked()` to read values without creating a dependency:

```typescript
import { untracked } from '@but212/atom-effect';

effect(() => {
  const tracked = source.value;             // Creates dependency
  const notTracked = config.peek();          // No dependency
  const alsoNotTracked = untracked(() => {   // No dependency
    return other.value;
  });
});
```

## Error Handling

### Computed Errors

Errors thrown during computation are captured and stored:

```typescript
const c = computed(() => {
  throw new Error('oops');
});

c.hasError;   // true
c.lastError;  // Error('oops')
c.errors;     // [Error('oops')] — includes errors from dependencies
```

With a `defaultValue`, errors become recoverable:

```typescript
const c = computed(() => { throw new Error('fail'); }, { defaultValue: 0 });
c.value; // 0 (does not throw)
```

### Effect Errors

Effects catch errors and log them. Use `onError` for custom handling:

```typescript
effect(() => {
  throw new Error('effect failed');
}, {
  onError: (err) => reportToSentry(err)
});
```

## Common Pitfalls

### 1. Forgetting to Dispose

Effects keep running until disposed. Always clean up in component lifecycles:

```typescript
const effectHandle = effect(() => { /* ... */ });
// Later:
effectHandle.dispose();
```

### 2. Writing Inside Computed

Computed functions must be **pure** (read-only). Writing to atoms inside a computed can cause infinite loops:

```typescript
// BAD
const bad = computed(() => {
  count.value++;  // Writing inside computed!
  return count.value;
});
```

### 3. Circular Dependencies

The library detects circular dependencies and throws a `ComputedError`:

```typescript
const a = computed(() => b.value + 1);
const b = computed(() => a.value + 1); // Throws: Circular dependency detected
```

### 4. Async Computed Without Default

Accessing an async computed's value before resolution throws if no `defaultValue` is set:

```typescript
const data = computed(async () => fetch('/api'));
data.value; // Throws: Async computation pending with no default value

// Fix:
const data = computed(async () => fetch('/api'), { defaultValue: null });
data.value; // null (while pending)
```

## Project Structure

```text
packages/core/src/
  core/
    atom.ts         — Writable atom implementation
    computed.ts     — Computed atom with async support
    effect.ts       — Side effect runner
    base.ts         — ReactiveNode / ReactiveDependency base classes
    tracking.ts     — Tracking context and dependency links
    scheduler.ts    — Microtask-based scheduler and epoch management
    buffers.ts      — Slot-buffered dependency storage
    lens.ts         — Writable atom lenses
  utils/
    debug.ts        — Runtime debug info and dev-only warnings
    type-guards.ts  — Reactive node type identification
  types.ts          — Public TypeScript definitions
  constants.ts      — Configuration flags and default values
  errors.ts         — Custom error classes and message registry
  symbols.ts        — Internal brands for runtime safety
  index.ts          — Main entry point
```

## Next Steps

To become a power user or contributor, explore the following:

- [**Architecture & Design**](./ARCHITECTURE.md):
  - **The Life of a Change**: How updates flow through the engine.
  - **Glitch-Free Guarantee**: How the library avoids inconsistent states.
  - **V8 Optimizations**: How we use bitwise flags and memory pooling for performance.
- [**API Reference**](./API.md): Full documentation of options, configuration, and advanced error handling.
