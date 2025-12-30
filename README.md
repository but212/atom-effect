# @but212/reactive-atom

[![npm version](https://img.shields.io/npm/v/@but212/reactive-atom.svg)](https://www.npmjs.com/package/@but212/reactive-atom)
[![npm downloads](https://img.shields.io/npm/dm/@but212/reactive-atom.svg)](https://www.npmjs.com/package/@but212/reactive-atom)
[![CI](https://github.com/but212/reactive-atom/workflows/CI/badge.svg)](https://github.com/but212/reactive-atom/actions)
[![codecov](https://codecov.io/gh/but212/reactive-atom/branch/main/graph/badge.svg)](https://codecov.io/gh/but212/reactive-atom)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@but212/reactive-atom)](https://bundlephobia.com/package/@but212/reactive-atom)
[![license](https://img.shields.io/npm/l/@but212/reactive-atom.svg)](https://github.com/but212/reactive-atom/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

> A lightweight TypeScript library for fine-grained reactive state management

**reactive-atom** is a library that provides fine-grained reactive state management by combining `atom`, `computed`, and `effect`. It implements a paradigm similar to React signals and Vue's reactivity system in TypeScript.

## 🆕 What's New in v1.1.0

- **🛡️ Production Safety**: Infinite loop detection now safely disposes effects in production (prevents crashes)
- **📐 Type Safety**: Async computed functions now enforce `defaultValue` at compile-time
- **⚙️ Scheduler API**: New `scheduler.setMaxFlushIterations()` for complex dependency graphs
- **💾 Memory Safety**: Enhanced with WeakMap usage to prevent memory leaks
- **🔒 Overflow Protection**: Promise ID overflow prevention for long-running applications

[View Changelog](./CHANGELOG.md)

## ✨ Key Features

- **Fine-grained Dependency Tracking**: Automatically tracks dependencies and recomputes only what's necessary
- **Sync/Async Support**: `computed` supports both synchronous and asynchronous (Promise-returning) functions
- **Framework-Agnostic**: Not limited to UI updates - applicable to any reactive logic
- **Minimalist API**: Simple API consisting of `atom`, `computed`, `effect`, `batch`, and `untracked`
- **Batch Updates**: Optimize performance by processing multiple state changes at once
- **Type Safety**: Full TypeScript support with compile-time type checking (async computed enforces defaultValue)
- **Developer-Friendly**: Circular reference detection, debug info, infinite loop protection, etc.
- **Lightweight**: Pure TypeScript implementation with zero external dependencies
- **Memory Optimized**: WeakRef-based automatic GC, Object pooling reduces GC pressure by 45%
- **Production Safe**: Automatic disposal on infinite loops prevents system hangs

## 📦 Installation

```bash
# npm
npm install @but212/reactive-atom

# pnpm
pnpm add @but212/reactive-atom

# yarn
yarn add @but212/reactive-atom
```

## 🚀 Quick Start

### 1. Atom - Basic State

```typescript
import { atom } from '@but212/reactive-atom';

const count = atom(0);

// Read value
console.log(count.value); // 0

// Write value
count.value = 10;
console.log(count.value); // 10

// Subscribe
const unsubscribe = count.subscribe((newValue, oldValue) => {
  console.log(`${oldValue} → ${newValue}`);
});

count.value = 20; // Console: "10 → 20"

// Unsubscribe
unsubscribe();
```

### 2. Computed - Derived State

```typescript
import { atom, computed } from '@but212/reactive-atom';

const firstName = atom('John');
const lastName = atom('Doe');

// Synchronous computed
const fullName = computed(() => `${firstName.value} ${lastName.value}`);
console.log(fullName.value); // "John Doe"

firstName.value = 'Jane';
console.log(fullName.value); // "Jane Doe"

// Asynchronous computed (defaultValue is required for async)
const userData = computed(
  async () => {
    const response = await fetch(`/api/user/${userId.value}`);
    return response.json();
  },
  { defaultValue: null } // Required for async computed
);

console.log(userData.state); // "pending" | "resolved" | "rejected"
console.log(userData.value); // defaultValue or resolved value
```

### 3. Effect - Side Effects

```typescript
import { atom, effect } from '@but212/reactive-atom';

const count = atom(0);

// Automatically tracks dependencies
effect(() => {
  console.log(`Count: ${count.value}`);
});
// Console: "Count: 0"

count.value = 1;
// Console: "Count: 1"

// Effect with cleanup
effect(() => {
  const timer = setInterval(() => {
    console.log(count.value);
  }, 1000);

  // Cleanup function
  return () => clearInterval(timer);
});
```

### 4. Batch - Batch Updates

```typescript
import { atom, batch } from '@but212/reactive-atom';

const x = atom(0);
const y = atom(0);
const sum = computed(() => x.value + y.value);

effect(() => {
  console.log(`Sum: ${sum.value}`);
});

// Without batch: effect runs twice
x.value = 10;
y.value = 20;

// With batch: effect runs only once
batch(() => {
  x.value = 100;
  y.value = 200;
});
```

### 5. Untracked - Break Dependency Tracking

```typescript
import { atom, computed, untracked } from '@but212/reactive-atom';

const count = atom(0);
const multiplier = atom(2);

// Only tracks count, not multiplier
const result = computed(() => {
  const c = count.value;
  const m = untracked(() => multiplier.value);
  return c * m;
});

count.value = 5; // result recomputes
multiplier.value = 3; // result does NOT recompute
```

## 📚 Core Concepts

### Atom

An **atom** is the most basic unit of state. It holds a single value and notifies subscribers when the value changes.

```typescript
const count = atom(0);
const user = atom({ name: 'John', age: 30 });

// Synchronous notification (default: async via microtask)
const syncAtom = atom(0, { sync: true });
```

### Computed

A **computed** value automatically recalculates when its dependencies change. It supports both synchronous and asynchronous computations.

```typescript
// Synchronous
const doubled = computed(() => count.value * 2);

// Asynchronous with default value (REQUIRED for async)
const userData = computed(
  async () => {
    const res = await fetch(`/api/user/${userId.value}`);
    return res.json();
  },
  { defaultValue: null } // TypeScript enforces this for async
);

// Lazy evaluation (computes only when accessed)
const expensive = computed(() => heavyComputation(), { lazy: true });

// Error handling with async
const safeData = computed(
  async () => {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error('Failed');
    return res.json();
  },
  {
    defaultValue: [], // Required for async
    onError: (error) => console.error('Fetch failed:', error),
  }
);
```

### Effect

An **effect** runs side effects when dependencies change. It automatically tracks all reactive values accessed during execution.

```typescript
// Basic effect
effect(() => {
  document.title = `Count: ${count.value}`;
});

// Effect with cleanup
effect(() => {
  const controller = new AbortController();

  fetch('/api/data', { signal: controller.signal })
    .then((res) => res.json())
    .then((data) => console.log(data));

  // Cleanup on re-run or disposal
  return () => controller.abort();
});

// Synchronous effect (runs immediately)
effect(
  () => {
    console.log('Immediate:', count.value);
  },
  { sync: true }
);

// Infinite loop protection (auto-disposes in production)
effect(
  () => {
    if (count.value < 10) {
      count.value++; // Detected and safely stopped
    }
  },
  { 
    trackModifications: true,
    maxExecutionsPerSecond: 100 // Default, configurable
  }
);
```

## 🎯 Advanced Usage

### Batch Updates

Batch multiple state changes to trigger effects only once:

```typescript
batch(() => {
  firstName.value = 'Jane';
  lastName.value = 'Smith';
  age.value = 25;
});
// Effects run only once after all changes
```

### Untracked Reads

Read reactive values without creating dependencies:

```typescript
const result = computed(() => {
  const a = atom1.value; // Tracked
  const b = untracked(() => atom2.value); // Not tracked
  return a + b;
});
```

### Peeking Values

Read current value without triggering dependency tracking:

```typescript
const current = count.peek(); // No dependency created
```

### Disposal

Clean up resources when done:

```typescript
const myAtom = atom(0);
const myComputed = computed(() => myAtom.value * 2);
const myEffect = effect(() => console.log(myComputed.value));

// Dispose individual resources
myEffect.dispose();
myComputed.dispose();
myAtom.dispose();
```

### Scheduler Configuration

Configure scheduler behavior for complex dependency graphs:

```typescript
import { scheduler } from '@but212/reactive-atom';

// Increase max iterations for deep dependency chains
scheduler.setMaxFlushIterations(5000); // Default: 1000

// Now complex graphs won't hit iteration limits
batch(() => {
  // Many interconnected updates...
});
```

## 🔧 API Reference

### `atom<T>(initialValue: T, options?: AtomOptions): Atom<T>`

Creates a reactive atom.

**Options:**

- `sync?: boolean` - If true, notify subscribers synchronously (default: `false`)

**Methods:**

- `value: T` - Get/set the current value
- `subscribe(listener: (newValue: T, oldValue: T) => void): () => void` - Subscribe to changes
- `peek(): T` - Read value without tracking
- `dispose(): void` - Clean up resources

### `computed<T>(fn: () => T | Promise<T>, options?: ComputedOptions<T>): ComputedAtom<T>`

Creates a computed value.

**Function Overloads:**

```typescript
// Synchronous: defaultValue is optional
computed<T>(fn: () => T, options?: ComputedOptions<T>): ComputedAtom<T>

// Asynchronous: defaultValue is REQUIRED
computed<T>(
  fn: () => Promise<T>,
  options: ComputedOptions<T> & { defaultValue: T }
): ComputedAtom<T>
```

**Options:**

- `equal?: (a: T, b: T) => boolean` - Custom equality function
- `defaultValue?: T` - Default value (required for async computed)
- `lazy?: boolean` - Lazy evaluation (default: `true`)
- `onError?: (error: Error) => void` - Error handler

**Properties:**

- `value: T` - Get the computed value
- `state: AsyncStateType` - Async state: `"idle" | "pending" | "resolved" | "rejected"`

**Methods:**

- `subscribe(listener: () => void): () => void` - Subscribe to changes
- `peek(): T` - Read value without tracking
- `dispose(): void` - Clean up resources

### `effect(fn: EffectFunction, options?: EffectOptions): EffectObject`

Runs side effects when dependencies change.

**Options:**

- `sync?: boolean` - Run synchronously (default: `false`)
- `maxExecutionsPerSecond?: number` - Infinite loop threshold (default: `100`)
- `trackModifications?: boolean` - Track dependency modifications (default: `false`)

**Methods:**

- `dispose(): void` - Stop the effect
- `run(): void` - Manually run the effect

### `batch(fn: () => void): void`

Batches multiple state changes.

### `untracked<T>(fn: () => T): T`

Reads reactive values without tracking dependencies.

### `scheduler`

Global scheduler instance for advanced configuration.

**Methods:**

- `setMaxFlushIterations(max: number): void` - Set maximum batch iterations (min: 10, default: 1000)

**Example:**

```typescript
import { scheduler } from '@but212/reactive-atom';

// For complex dependency graphs
scheduler.setMaxFlushIterations(5000);
```

## 🚀 Performance

- **Atom creation**: ~2M ops/sec
- **Computed recomputation**: ~339K ops/sec
- **Unsubscribe**: O(1) complexity (10-1000x faster than v1.0)
- **Memory efficient**: WeakRef-based automatic GC
- **GC pressure**: 45% reduction with object pooling

## 🧪 Testing

```bash
# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch

# Run benchmarks
pnpm bench
```

## 📊 Benchmarks

```bash
# Run all benchmarks
pnpm bench

# Run micro benchmarks only
pnpm bench:micro

# Run macro benchmarks only
pnpm bench:macro

# Run specific benchmark
pnpm bench:atom
pnpm bench:computed
pnpm bench:effect
```

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

## 📄 License

MIT © [Jeongil Suk](https://github.com/but212)

## 🔗 Links

- [GitHub Repository](https://github.com/but212/reactive-atom)
- [npm Package](https://www.npmjs.com/package/@but212/reactive-atom)
- [Issue Tracker](https://github.com/but212/reactive-atom/issues)
- [Changelog](./CHANGELOG.md)

## 💡 Inspiration

This library is inspired by:

- [Solid.js Signals](https://www.solidjs.com/docs/latest/api#createsignal)
- [Vue 3 Reactivity](https://vuejs.org/guide/extras/reactivity-in-depth.html)
- [Preact Signals](https://preactjs.com/guide/v10/signals/)
- [MobX](https://mobx.js.org/)

## 🌟 Why reactive-atom?

| Feature | reactive-atom | Solid Signals | Vue Reactivity | Preact Signals |
|---------|---------------|---------------|----------------|----------------|
| Framework-agnostic | ✅ | ❌ | ✅ | ❌ |
| Async computed | ✅ | ❌ | ❌ | ❌ |
| TypeScript-first | ✅ | ✅ | ✅ | ✅ |
| Zero dependencies | ✅ | ❌ | ❌ | ❌ |
| Memory optimized | ✅ | ✅ | ✅ | ❌ |
| Bundle size | ~5KB | ~3KB | ~10KB | ~2KB |

---

**Made with ❤️ by [Jeongil Suk](https://github.com/but212)**
