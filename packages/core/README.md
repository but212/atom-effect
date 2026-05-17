# @but212/atom-effect

[![npm version](https://img.shields.io/npm/v/@but212/atom-effect.svg)](https://www.npmjs.com/package/@but212/atom-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![ES2022+](https://img.shields.io/badge/target-ES2022%2B-blue)

The core reactive engine for `atom-effect`, implementing an epoch-based propagation system with asynchronous orchestration.

## Overview

This package provides high-performance reactive primitives for JavaScript environments. It manages state synchronization through a deterministic push-pull dependency graph, ensuring glitch-free updates and automated resource management.

### Key Characteristics

- **Target**: ES2022+ environments.
- **Architecture**: Epoch-based propagation with local version tracking.
- **Async First**: Native `async/await` support in computed nodes with built-in race condition protection.

## Installation

```bash
pnpm add @but212/atom-effect
```

## Usage

```typescript
import { atom, computed, effect } from '@but212/atom-effect';

// 1. Initialize Mutable State
const count = atom(0);

// 2. Define Derived State (Lazy & Cached)
const double = computed(() => count.value * 2);

// 3. Register Reactive Side-Effect
const handle = effect(() => {
  console.log(`Count: ${count.value}, Double: ${double.value}`);
});

// 4. Update State
count.value++; // Logs: "Count: 1, Double: 2"

// 5. Cleanup
handle.dispose();
```

## Documentation

- [**Onboarding Guide**](./docs/ONBOARDING.md): Core concepts, mental model, and best practices.
- [**API Reference**](./docs/API.md): Specification for `atom`, `computed`, `effect`, `batch`, and `lenses`.
- [**Architecture & Design**](./docs/ARCHITECTURE.md): Deep dive into the internal engine, scheduler, and performance optimizations.

## License

MIT © [Jeongil Suk](https://github.com/but212)
