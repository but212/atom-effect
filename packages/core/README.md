# @but212/atom-effect

[![npm version](https://img.shields.io/npm/v/@but212/atom-effect.svg)](https://www.npmjs.com/package/@but212/atom-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

a signal for reactive state management.

## Installation

```bash
npm i @but212/atom-effect
```

### CDN

```html
<script src="https://cdn.jsdelivr.net/npm/@but212/atom-effect@latest"></script>
<!-- or -->
<script src="https://unpkg.com/@but212/atom-effect@latest"></script>
```

## Core API

### `atom(value)`

Creates a mutable state container.

- **read**: `atom.value` (tracks dependency)
- **write**: `atom.value = newValue` (triggers effects)
- **peek**: `atom.peek()` (read without tracking)

```typescript
const count = atom(0);
count.value++;
console.log(count.value);
```

### `computed(fn)`

Creates a derived value that automatically updates when dependencies change.

- Lazy evaluation (only computes when read or needed by an effect).
- Caches result until dependencies change.

```typescript
const double = computed(() => count.value * 2);
```

### `effect(fn)`

Runs a function immediately and re-runs it whenever its dependencies change.

- Returns a `dispose` function to stop the effect.

```typescript
const stop = effect(() => {
  console.log(count.value);
});
stop();
```

### `batch(fn)`

Groups multiple updates and ensures they are **flushed synchronously** when the function completes.

> **Note:** While the library automatically batches updates using microtasks, `batch()` is useful when you need to ensure all effects have run immediately after a block of changes.

```typescript
batch(() => {
  count.value = 1;
  count.value = 2;
}); 
// Effects are guaranteed to have run synchronously here
```

### `untracked(fn)`

Runs a function without tracking any dependencies accessed within it.

```typescript
computed(() => {
  // `count` is not tracked as a dependency here
  return untracked(() => count.value * 2);
});
```

## API Reference

### Detailed Options

#### `atom(initialValue, options?)`

- `name`: (string) Debug name.

#### `computed(fn, options?)`

- `equal`: (fn) Comparison function to skip re-computes.
- `defaultValue`: (any) Value to return when pending/error.
- `lazy`: (boolean) If true, defers evaluation until read.

#### `effect(fn, options?)`

- `sync`: (boolean) Runs synchronously on change.
- `onError`: (fn) Async error handler.
- `trackModifications`: (boolean) Warns on self-writes.

### Advanced Usage

#### Async Computed

```typescript
const userId = atom(1);
const user = computed(async () => {
  const res = await fetch(`/api/users/${userId.value}`);
  return res.json();
}, { defaultValue: { loading: true } });
```

## Utilities & Development

### Type Guards

```typescript
import { isAtom, isComputed, isReactive } from '@but212/atom-effect';

isAtom(count); // true
isReactive(double); // true
```

### Development Commands

```bash
pnpm test        # Run unit tests
pnpm bench       # Run benchmarks
pnpm lint        # Run lint checks
pnpm build       # Build production bundle
```

## Performance

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

| Operation | Performance |
| --- | --- |
| Atom creation (x1000) | ~13.9K ops/sec |
| Atom read (x1000) | ~38.1K ops/sec |
| Atom write (x1000) | ~343K ops/sec |
| Computed creation | ~2.17M ops/sec |
| Computed recomputation | ~564K ops/sec |
| Effect execution | ~2.78M ops/sec |
| Batched updates (x2) | ~3.97M ops/sec |
| Deep chain (100 levels) | ~8.16K ops/sec |

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

## License

MIT © [Jeongil Suk](https://github.com/but212)
