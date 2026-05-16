# @but212/atom-effect

[![npm version](https://img.shields.io/npm/v/@but212/atom-effect.svg)](https://www.npmjs.com/package/@but212/atom-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![ES2022+](https://img.shields.io/badge/target-ES2022%2B-blue)

Core reactive state management engine implementing an epoch-based dependency tracking system.

## Overview

This package provides the foundational primitives for reactive programming in JavaScript environments. It manages state synchronization through a pull-based dependency graph, ensuring deterministic execution and automatic resource management.

- **Target**: ES2022+
- **Architecture**: Epoch-based push/pull propagation
- **Features**: Atomic batching, lazy evaluation, and explicit effect cleanup.

## Installation

```bash
npm install @but212/atom-effect
```

## Usage

The following example demonstrates the primary primitives for state initialization, derivation, and side-effect orchestration.

```typescript
import { atom, computed, effect } from '@but212/atom-effect';

// 1. Initialize State
const count = atom(0);
const multiplier = atom(2);

// 2. Derive State (Lazy Evaluation & Identity Caching)
const doubled = computed(() => count.value * multiplier.value);

// 3. Side-Effect Orchestration
const effectHandle = effect(() => {
  console.log(`Count: ${count.value}, Doubled: ${doubled.value}`);
});
// Output: "Count: 0, Doubled: 0"

// 4. State Modification
count.value = 1;
// Output: "Count: 1, Doubled: 2"

// 5. Explicit Disposal
effectHandle.dispose();
```

## Documentation

- [**Technical Overview**](./docs/ONBOARDING.md): Core concepts, mental model, and architectural boundaries.
- [**API Reference**](./docs/API.md): Specification for `atom`, `computed`, `effect`, `batch`, and `untracked`.
- [**Internals**](./docs/ARCHITECTURE.md): Deep dive into the epoch-based propagation algorithm and dependency slot management.

## License

MIT © [Jeongil Suk](https://github.com/but212)
