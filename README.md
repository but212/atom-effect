# @but212/atom-effect

[![npm version](https://img.shields.io/npm/v/@but212/atom-effect.svg)](https://www.npmjs.com/package/@but212/atom-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/but212/atom-effect)

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

## Core Concepts

### 1. Atom (`atom`)

- **What**: A mutable value wrapper.
- **Why**: Primitive values can't be observed. Atoms wrap them so the system can track readers.
- **When**: Use for your source of truth state.

### 2. Computed (`computed`)

- **What**: A value derived from atoms or other computeds.
- **Why**: It caches the result and only recalculates when inputs actually change.
- **When**: Use for derived data or transformations.

### 3. Effect (`effect`)

- **What**: A function that runs when observed data changes.
- **Why**: To bridge reactivity to the outside world (DOM updates, logging, network requests).
- **When**: Use for side effects. Avoid using to update other atoms (use `computed` for that).

## Examples

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

By default, effects are batched via microtasks—multiple synchronous updates result in a single effect run. Use `batch()` when you need the effect to run **synchronously** after the updates.

```typescript
import { atom, effect, batch } from '@but212/atom-effect';

const firstName = atom("John");
const lastName = atom("Doe");

effect(() => {
  console.log(`Fullname: ${firstName.value} ${lastName.value}`);
});

// Without batch: effect runs on the next microtask (async)
firstName.value = "Jane";
lastName.value = "Smith";
// Effect has not run yet here

// With batch: effect runs immediately after batch ends (sync)
batch(() => {
  firstName.value = "Alice";
  lastName.value = "Brown";
});
// Effect has already run here
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

## Documentation Links

- **[Architecture & Design](./ARCHITECTURE.md)**: Internal design decisions and V8 considerations.
- **[Contributing Guide](./CONTRIBUTING.md)**: How to set up, test, and contribute.
- **[Migration Guide](./MIGRATION.md)**: Upgrading from previous versions.
- **[Changelog](./CHANGELOG.md)**: Release notes.

## Packages

| Package | Version | Description |
| --- | --- | --- |
| [@but212/atom-effect](./packages/core) | [![npm](https://img.shields.io/npm/v/@but212/atom-effect.svg)](https://www.npmjs.com/package/@but212/atom-effect) | Core reactive primitives (`atom`, `computed`, `effect`) |
| [@but212/atom-effect-jquery](./packages/jquery) | [![npm](https://img.shields.io/npm/v/@but212/atom-effect-jquery.svg)](https://www.npmjs.com/package/@but212/atom-effect-jquery) | jQuery reactive bindings |

## License

MIT © [Jeongil Suk](https://github.com/but212)
