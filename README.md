# @but212/atom-effect

> **A high-performance, V8-optimized reactive state management library.**

[![npm version](https://img.shields.io/npm/v/@but212/atom-effect.svg)](https://www.npmjs.com/package/@but212/atom-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Library?

Most reactivity libraries focus on Developer Experience (DX). We focus on **Raw Performance**.

*   **V8 Optimized**: Internals are hand-tuned for V8 hidden classes and memory layout.
*   **Glitch-Free**: Guarantees consistent state updates without "zombie children" or redundant computations.
*   **Memory Efficient**: Uses Smi (Small Integer) field packing to minimize object size.

**Use this if:** You are building a high-frequency trading dashboard, a complex data visualization, or a game UI where every microsecond counts.
**Maybe not if:** You just want the simplest possible state for a Todo app (though it works great there too!).

---

## Quick Start

### Installation

```bash
pnpm add @but212/atom-effect
# or
npm install @but212/atom-effect
```

### Basic Usage

```typescript
import { atom, computed, effect } from '@but212/atom-effect';

// 1. Create state (Atom)
const count = atom(0);

// 2. Derive state (Computed) - updates only when needed
const double = computed(() => count.value * 2);

// 3. React to changes (Effect) - runs immediately, then on changes
effect(() => {
  console.log(`Count: ${count.value}, Double: ${double.value}`);
});
// Output: "Count: 0, Double: 0"

// 4. Update state
count.value++;
// Output: "Count: 1, Double: 2"
```

---

## Core Concepts

### 1. Atom (`atom`)
*   **What**: A mutable value wrapper.
*   **Why**: Primitive values (numbers, strings) can't be observed. Atoms wrap them so the system can track who is reading them.
*   **When**: Use for your "source of truth" state.

### 2. Computed (`computed`)
*   **What**: A value derived from atoms or other computeds.
*   **Why**: It caches the result. It only recalculates if the input *actually* changed, and only when someone reads it.
*   **When**: Use for expensive calculations (filtering lists, math) or transforming data.

### 3. Effect (`effect`)
*   **What**: A function that runs when observed data changes.
*   **Why**: To bridge reactivity to the outside world (DOM updates, console logs, network requests).
*   **When**: Use for side effects. Do *not* use to update other atoms (use `computed` for that).

---

## Tactical Examples

### Pattern 1: Async Resource with Cleanup
Handling async data often requires cleaning up stale requests. `effect` supports a cleanup function.

```typescript
const userId = atom(1);

effect(() => {
  const currentId = userId.value;
  const controller = new AbortController();

  console.log(`Fetching user ${currentId}...`);

  fetch(`/api/users/${currentId}`, { signal: controller.signal })
    .then(r => r.json())
    .then(data => console.log('User loaded:', data))
    .catch(err => {
      if (err.name !== 'AbortError') console.error(err);
    });

  // Cleanup function: runs before the next effect execution
  return () => {
    console.log(`Aborting fetch for user ${currentId}`);
    controller.abort();
  };
});

// Changing userId immediately aborts the previous fetch
userId.value = 2;
```

### Pattern 2: Batching Updates
Sometimes you change multiple things at once and don't want the UI to flicker.

```typescript
import { atom, effect, batch } from '@but212/atom-effect';

const firstName = atom("John");
const lastName = atom("Doe");

effect(() => {
  console.log(`Fullname: ${firstName.value} ${lastName.value}`);
});

// Without batch: triggers effect twice
// firstName.value = "Jane";
// lastName.value = "Smith";

// With batch: triggers effect once
batch(() => {
  firstName.value = "Jane";
  lastName.value = "Smith";
});
```

### Pattern 3: Peeking without Tracking
Sometimes you need to read a value inside an effect *without* re-running the effect when that value changes.

```typescript
const counter = atom(0);
const loggerEnabled = atom(true);

effect(() => {
  // We depend on 'counter'
  const val = counter.value;

  // We read 'loggerEnabled' but don't want to re-run if ONLY the config changes
  if (loggerEnabled.peek()) {
    console.log("Logged:", val);
  }
});
```

---

## Documentation Links

*   **[Architecture & Design](./ARCHITECTURE.md)**: Deep dive into V8 optimizations and internals.
*   **[Contributing Guide](./CONTRIBUTING.md)**: How to set up, test, and contribute.
*   **[Migration Guide](./MIGRATION.md)**: Upgrading from previous versions.
*   **[Changelog](./CHANGELOG.md)**: Release notes.

---

## Packages

| Package | Description |
| --- | --- |
| **[`@but212/atom-effect`](./packages/core)** | The core library (Zero dependencies). |
| **[`@but212/atom-effect-jquery`](./packages/jquery)** | jQuery integration bindings. |

## License

MIT © [Jeongil Suk](https://github.com/but212)
