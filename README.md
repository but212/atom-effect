# atom-effect

[![npm version](https://img.shields.io/npm/v/atom-effect.svg)](https://www.npmjs.com/package/@but212/atom-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

A lightweight, high-performance reactive state management library for TypeScript/JavaScript with zero dependencies.

## Features

- **Core Primitives**: `atom`, `computed`, `effect`, `batch`, `untracked`
- **Zero Dependencies** - Minimal footprint
- **Full TypeScript Support** - Strict type checking
- **Developer Friendly** - Circular dependency detection, infinite loop protection, auto debug IDs

## Installation

```bash
npm i @but212/atom-effect
```

## Quick Start

```typescript
import { atom, computed, effect, batch } from '@but212/atom-effect';

// Create reactive state
const count = atom(0);
const name = atom('Alice');

// Derived state
const greeting = computed(() => `Hello, ${name.value}! Count: ${count.value}`);

// Side effects with automatic cleanup
const effectObj = effect(() => {
  console.log(greeting.value);
});

// Batch updates for performance
batch(() => {
  count.value = 1;
  name.value = 'Bob';
}); // Effect runs only once

effectObj.dispose();
```

## Core API

### `atom(initialValue, options?)`

Creates reactive state with automatic dependency tracking.

```typescript
const count = atom(0);

count.value = 1;           // Write
console.log(count.value);  // Read (tracks dependencies)
console.log(count.peek()); // Read without tracking

const unsubscribe = count.subscribe((newVal, oldVal) => {
  console.log(`${oldVal} → ${newVal}`);
});
```

**Options:** `{ sync: boolean }` - Synchronous updates (default: `false`)

### `computed(fn, options?)`

Creates derived state that recomputes when dependencies change.

```typescript
const count = atom(0);
const doubled = computed(() => count.value * 2);

// Async computed
const userId = atom(1);
const userData = computed(
  async () => {
    const res = await fetch(`/api/users/${userId.value}`);
    return res.json();
  },
  { defaultValue: null }
);
```

**Options:**

- `equal` - Custom equality function (default: `Object.is`)
- `defaultValue` - Required for async functions
- `lazy` - Compute only when accessed (default: `true`)
- `onError` - Error callback for computation failures

### `effect(fn)`

Runs side effects with automatic dependency tracking and cleanup.

```typescript
const count = atom(0);

const effectObj = effect(() => {
  console.log(`Count: ${count.value}`);
  
  // Optional cleanup
  return () => console.log('cleanup');
});

effectObj.dispose(); // Stop the effect
```

### `batch(fn)`

Batches multiple updates to run effects only once.

```typescript
const firstName = atom('John');
const lastName = atom('Doe');
const fullName = computed(() => `${firstName.value} ${lastName.value}`);

effect(() => console.log(fullName.value));

// Without batch - logs twice
firstName.value = 'Jane';
lastName.value = 'Smith';

// With batch - logs once
batch(() => {
  firstName.value = 'Alice';
  lastName.value = 'Johnson';
});
```

### `untracked(fn)`

Executes function without tracking dependencies.

```typescript
const a = atom(1);
const b = atom(2);

const sum = computed(() => {
  const aValue = a.value;                    // Tracked
  const bValue = untracked(() => b.value);   // NOT tracked
  return aValue + bValue;
});
```

## Common Patterns

### Form Validation

```typescript
const email = atom('');
const password = atom('');

const isValid = computed(() => {
  return email.value.includes('@') && password.value.length >= 8;
});

effect(() => {
  submitButton.disabled = !isValid.value;
});
```

### API Integration

```typescript
const userId = atom(1);
const userData = computed(async () => {
  const res = await fetch(`/api/users/${userId.value}`);
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
}, {
  defaultValue: null,
  onError: (e) => console.error('Failed to fetch user data:', e)
});

effect(() => {
  if (userData.value) {
    console.log('User loaded:', userData.value.name);
  }
});
```

### Persistent State

```typescript
function persistentAtom<T>(key: string, initialValue: T) {
  const stored = localStorage.getItem(key);
  const a = atom<T>(stored ? JSON.parse(stored) : initialValue);
  
  effect(() => {
    localStorage.setItem(key, JSON.stringify(a.value));
  });
  
  return a;
}

const theme = persistentAtom('theme', 'light');
```

## Utilities

### Type Guards

```typescript
import { isAtom, isComputed, isEffect } from 'atom-effect';

isAtom(count);      // true
isComputed(doubled); // true
```

### Configuration

```typescript
import { DEBUG_CONFIG, POOL_CONFIG, SCHEDULER_CONFIG } from 'atom-effect';

// You can access read-only configuration constants for reference.
console.log(DEBUG_CONFIG.MAX_DEPENDENCIES);     // 1000
console.log(DEBUG_CONFIG.WARN_INFINITE_LOOP);   // true

console.log(POOL_CONFIG.MAX_SIZE);               // 1000
console.log(POOL_CONFIG.WARMUP_SIZE);            // 100

console.log(SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_SECOND); // 100
```

### Error Handling

```typescript
import { AtomError, ComputedError, EffectError } from 'atom-effect';

try {
  // Your code
} catch (error) {
  if (error instanceof EffectError) {
    console.error('Effect failed:', error);
  }
}
```

## Performance

| Operation | Performance |
|-----------|-------------|
| Atom creation | ~5M ops/sec |
| Atom read/write | ~4.9M ops/sec |
| Computed creation | ~2M ops/sec |
| Computed recomputation | ~250K ops/sec |
| Effect execution | ~320K ops/sec |
| Batch update (2 atoms) | ~2.4M ops/sec |
| Untracked read | ~3.1M ops/sec |

See [docs/BENCHMARKS.md](./docs/BENCHMARKS.md) for details.

## Testing

```bash
pnpm test              # Run all tests (400+ test cases)
pnpm test:coverage     # With coverage
pnpm bench             # Run benchmarks
```

## Development

```bash
pnpm install           # Install dependencies
pnpm build             # Build
pnpm test              # Test
pnpm typecheck         # Type checking
pnpm lint              # Lint code
```

## TypeScript Support

```typescript
const count = atom(0);              // WritableAtom<number>
const doubled = computed(() => count.value * 2); // ReadonlyAtom<number>

// doubled.value = 10; // ❌ Error: Cannot assign to readonly

const user = atom<User | null>(null); // Explicit typing
```

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request if you have any suggestions, bug reports, or improvements.

## License

MIT © [Jeongil Suk](https://github.com/but212)
