# reactive-atom

[![npm version](https://img.shields.io/npm/v/@but212/reactive-atom.svg)](https://www.npmjs.com/package/@but212/reactive-atom)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

A lightweight, high-performance reactive state management library for TypeScript/JavaScript applications. Built with zero dependencies and exceptional performance in mind.

## Features

### Core Primitives

- **`atom`** - Reactive state primitive with automatic dependency tracking
- **`computed`** - Derived state with sync/async support and smart caching
- **`effect`** - Side effect management with automatic cleanup
- **`batch`** - Batch multiple updates for optimal performance

### Performance & Optimization

- **Zero Dependencies** - Minimal footprint, maximum control
- **Object Pooling** - Reduced GC pressure through resource reuse
- **Lazy Initialization** - Memory-efficient state management
- **WeakRef-based Tracking** - Prevents memory leaks automatically
- **queueMicrotask Scheduler** - Optimal async execution
- **O(1) Operations** - Subscription management with Map-based lookup
- **Smart Caching** - Computed values recompute only when dependencies change

### Developer Experience

- **Full TypeScript Support** - Strict type checking with comprehensive types
- **Circular Dependency Detection** - Development mode safety checks
- **Infinite Loop Protection** - Configurable thresholds with sliding window algorithm
- **Auto Debug IDs** - Automatic ID assignment (`atom_1`, `computed_2`, etc.)
- **Structured Errors** - Clear error class hierarchy for better debugging
- **Comprehensive JSDoc** - Inline documentation for all APIs

## Installation

```bash
npm install @but212/reactive-atom
# or
pnpm add @but212/reactive-atom
# or
yarn add @but212/reactive-atom
```

## Quick Start

```typescript
import { atom, computed, effect, batch } from '@but212/reactive-atom';

// Create reactive state
const count = atom(0);
const name = atom('Alice');

// Derived state
const greeting = computed(() => `Hello, ${name.value}! Count: ${count.value}`);

// Side effects with automatic cleanup
const dispose = effect(() => {
  console.log(greeting.value);
  // This runs whenever count or name changes
});

// Batch updates for performance
batch(() => {
  count.value = 1;
  name.value = 'Bob';
  // Effect runs only once after both updates
});

// Cleanup
dispose();
```

## API Reference

### `atom<T>(initialValue: T, options?: AtomOptions): WritableAtom<T>`

Creates a reactive state container.

```typescript
const count = atom(0);
const user = atom({ name: 'Alice', age: 30 });

// Read value (tracks dependencies)
console.log(count.value); // 0

// Write value (notifies subscribers)
count.value = 1;

// Peek without tracking
console.log(count.peek()); // 1

// Subscribe to changes
const unsubscribe = count.subscribe((newValue, oldValue) => {
  console.log(`Changed from ${oldValue} to ${newValue}`);
});

// Options
const syncAtom = atom(0, { sync: true }); // Synchronous updates
```

**Methods:**

- `get value()` - Read current value and track dependency
- `set value(newValue)` - Update value and notify subscribers
- `peek()` - Read without tracking dependencies
- `subscribe(listener)` - Subscribe to changes, returns unsubscribe function
- `dispose()` - Clean up all subscriptions
- `subscriberCount()` - Get number of active subscribers

---

### `computed<T>(fn: () => T, options?: ComputedOptions<T>): ReadonlyAtom<T>`

Creates a derived state that automatically recomputes when dependencies change.

```typescript
// Synchronous computed
const count = atom(0);
const doubled = computed(() => count.value * 2);

console.log(doubled.value); // 0
count.value = 5;
console.log(doubled.value); // 10

// Async computed (requires defaultValue)
const userId = atom(1);
const userData = computed(
  async () => {
    const response = await fetch(`/api/users/${userId.value}`);
    return response.json();
  },
  { defaultValue: null }
);

// Lazy computed (computes only when accessed)
const expensive = computed(() => heavyComputation(), { lazy: true });
```

**Options:**

- `defaultValue` - Default value (required for async functions)
- `lazy` - Compute only when accessed (default: `false`)
- `sync` - Synchronous updates (default: `false`)

**Methods:**

- `get value()` - Get computed value (recomputes if stale)
- `peek()` - Get cached value without recomputing
- `dispose()` - Clean up and stop tracking

---

### `effect(fn: () => void | (() => void)): () => void`

Runs a side effect and re-runs when dependencies change.

```typescript
const count = atom(0);

// Basic effect
const dispose = effect(() => {
  console.log(`Count is: ${count.value}`);
});

// Effect with cleanup
const dispose2 = effect(() => {
  const timer = setInterval(() => {
    console.log(count.value);
  }, 1000);
  
  // Cleanup function runs before next execution or disposal
  return () => clearInterval(timer);
});

// Stop the effect
dispose();
dispose2();
```

**Features:**

- Automatic dependency tracking
- Cleanup function support
- Infinite loop detection
- Automatic disposal on errors

---

### `batch(fn: () => void): void`

Batch multiple updates to execute effects only once.

```typescript
const firstName = atom('John');
const lastName = atom('Doe');
const fullName = computed(() => `${firstName.value} ${lastName.value}`);

effect(() => console.log(fullName.value));
// Logs: "John Doe"

// Without batch - logs twice
firstName.value = 'Jane';  // Logs: "Jane Doe"
lastName.value = 'Smith';  // Logs: "Jane Smith"

// With batch - logs once
batch(() => {
  firstName.value = 'Alice';
  lastName.value = 'Johnson';
}); // Logs: "Alice Johnson" (only once)
```

---

### `untracked<T>(fn: () => T): T`

Execute a function without tracking dependencies.

```typescript
const a = atom(1);
const b = atom(2);

const sum = computed(() => {
  const aValue = a.value; // Tracked
  const bValue = untracked(() => b.value); // NOT tracked
  return aValue + bValue;
});

console.log(sum.value); // 3
b.value = 10;
console.log(sum.value); // 3 (didn't recompute, b is not a dependency)
a.value = 5;
console.log(sum.value); // 15 (recomputed because a changed)
```

---

### Type Guards

```typescript
import { isAtom, isComputed, isEffect } from '@but212/reactive-atom';

const a = atom(1);
const c = computed(() => a.value * 2);

isAtom(a);      // true
isComputed(c);  // true
isEffect(a);    // false
```

---

### Configuration

```typescript
import { DEBUG_CONFIG, POOL_CONFIG, SCHEDULER_CONFIG, scheduler } from '@but212/reactive-atom';

// Debug configuration
DEBUG_CONFIG.ENABLE_CIRCULAR_DEPENDENCY_DETECTION = true;
DEBUG_CONFIG.ENABLE_INFINITE_LOOP_DETECTION = true;
DEBUG_CONFIG.MAX_EFFECT_ITERATIONS = 100;

// Object pooling
POOL_CONFIG.INITIAL_SIZE = 16;
POOL_CONFIG.MAX_SIZE = 256;

// Scheduler
SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS = 100;
scheduler.setMaxFlushIterations(200);
```

---

### Error Classes

```typescript
import { AtomError, ComputedError, EffectError, SchedulerError } from '@but212/reactive-atom';

try {
  // Your code
} catch (error) {
  if (error instanceof EffectError) {
    console.error('Effect execution failed:', error);
  }
}
```

## Use Cases

### State Management

```typescript
// Application state
const todoList = atom([]);
const filter = atom('all'); // 'all' | 'active' | 'completed'

const filteredTodos = computed(() => {
  const todos = todoList.value;
  const currentFilter = filter.value;
  
  if (currentFilter === 'active') {
    return todos.filter(t => !t.completed);
  }
  if (currentFilter === 'completed') {
    return todos.filter(t => t.completed);
  }
  return todos;
});

// Update UI on changes
effect(() => {
  renderTodoList(filteredTodos.value);
});
```

### Form Handling

```typescript
const formData = atom({ email: '', password: '' });
const isValid = computed(() => {
  const { email, password } = formData.value;
  return email.includes('@') && password.length >= 8;
});

const submitButton = document.querySelector('#submit');
effect(() => {
  submitButton.disabled = !isValid.value;
});
```

### API Integration

```typescript
const userId = atom(null);
const userProfile = computed(async () => {
  if (!userId.value) return null;
  const res = await fetch(`/api/users/${userId.value}`);
  return res.json();
}, { defaultValue: null });

effect(() => {
  if (userProfile.value) {
    updateUI(userProfile.value);
  }
});
```

## Advanced Patterns

### Derived Atoms

```typescript
function createDerivedAtom<T, U>(
  source: ReadonlyAtom<T>,
  transform: (value: T) => U
): ReadonlyAtom<U> {
  return computed(() => transform(source.value));
}

const count = atom(0);
const doubled = createDerivedAtom(count, n => n * 2);
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

### Async State Machine

```typescript
const AsyncState = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error'
} as const;

const status = atom(AsyncState.IDLE);
const data = atom(null);
const error = atom(null);

async function fetchData(url: string) {
  status.value = AsyncState.LOADING;
  try {
    const response = await fetch(url);
    data.value = await response.json();
    status.value = AsyncState.SUCCESS;
  } catch (e) {
    error.value = e;
    status.value = AsyncState.ERROR;
  }
}
```

## Performance

Based on comprehensive benchmarks in `docs/BENCHMARKS.md`:

| Operation | Performance | Notes |
|-----------|-------------|-------|
| Atom creation | ~2M ops/sec | Ultra-fast primitive creation |
| Atom read/write | ~340K ops/sec | Sub-microsecond operations |
| Computed recomputation | ~339K ops/sec | Smart caching reduces overhead |
| Effect execution | ~200K ops/sec | Automatic dependency tracking |
| Batch updates | ~150K ops/sec | Optimized for multiple changes |
| Unsubscribe | O(1) | Constant-time cleanup |

### Running Benchmarks

```bash
# Run all benchmarks
pnpm bench

# Micro-benchmarks (atom, computed, effect)
pnpm bench:micro

# Macro-benchmarks (real-world scenarios)
pnpm bench:macro

# Set performance baseline
pnpm bench:baseline

# Check for regressions
pnpm bench:regression
```

See [docs/BENCHMARKS.md](./docs/BENCHMARKS.md) for detailed benchmark documentation.

## Testing

The library includes a comprehensive test suite with 400+ test cases:

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run unit tests only
pnpm test:unit

# Run integration tests
pnpm test:integration

# Watch mode
pnpm test:watch
```

### Test Coverage

- **Unit Tests**: Core primitives (atom, computed, effect, batch, untracked)
- **Integration Tests**: Complex reactive flows and edge cases
- **DOM Tests**: Browser integration (form binding, conditional rendering, list rendering)
- **Performance Tests**: Memory leaks, GC pressure, large-scale scenarios

## Project Structure

```text
reactive-atom/
├── src/
│   ├── core/           # Core primitives (atom, computed, effect)
│   ├── scheduler/      # Batch execution and task scheduling
│   ├── tracking/       # Dependency tracking system
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utilities (debug, type guards, object pool)
│   ├── errors/         # Error classes and messages
│   ├── constants.ts    # Configuration constants
│   └── index.ts        # Public API exports
├── __tests__/          # Test suite
│   ├── unit/           # Unit tests
│   ├── integration/    # Integration tests
│   └── dom/            # DOM integration tests
├── __benchmarks__/     # Performance benchmarks
│   ├── micro/          # Micro-benchmarks
│   └── macro/          # Macro-benchmarks
├── docs/               # Documentation
│   └── BENCHMARKS.md   # Benchmark documentation
└── scripts/            # Build and utility scripts
```

## Type Safety

Full TypeScript support with strict type checking:

```typescript
// Type inference
const count = atom(0);           // WritableAtom<number>
const name = atom('Alice');      // WritableAtom<string>

// Generic types
const user = atom<User | null>(null);

// Readonly computed
const doubled = computed(() => count.value * 2); // ReadonlyAtom<number>
// doubled.value = 10; // ❌ Error: Cannot assign to 'value'

// Async computed requires defaultValue
const data = computed(async () => {
  return await fetchData();
}, { defaultValue: [] });
```

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Type checking
pnpm typecheck

# Linting
pnpm lint
pnpm lint:fix

# Formatting
pnpm format
```

## Configuration Options

### Debug Configuration

```typescript
DEBUG_CONFIG.ENABLE_CIRCULAR_DEPENDENCY_DETECTION = true;  // Detect circular deps
DEBUG_CONFIG.ENABLE_INFINITE_LOOP_DETECTION = true;        // Detect infinite loops
DEBUG_CONFIG.MAX_EFFECT_ITERATIONS = 100;                  // Max effect iterations
DEBUG_CONFIG.EFFECT_WINDOW_SIZE = 10;                      // Sliding window size
```

### Object Pool Configuration

```typescript
POOL_CONFIG.INITIAL_SIZE = 16;   // Initial pool size
POOL_CONFIG.MAX_SIZE = 256;      // Maximum pool size
```

### Scheduler Configuration

```typescript
SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS = 100;  // Max batch iterations
scheduler.setMaxFlushIterations(200);          // Runtime configuration
```

## License

MIT © [Jeongil Suk](https://github.com/but212)
