# @but212/atom-effect

> **A glitch-free, async-first reactivity system for modern web applications.**  
> Small enough to fit in your head, powerful enough to drive complex UIs.

[![npm version](https://img.shields.io/npm/v/@but212/atom-effect.svg)](https://www.npmjs.com/package/@but212/atom-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Installation

```bash
npm install @but212/atom-effect
```

### Usage in 30 Seconds

```typescript
import { atom, computed, effect } from '@but212/atom-effect';

// 1. Create State
const count = atom(0);
const multiplier = atom(2);

// 2. Derive State (Lazy & Cached)
const doubled = computed(() => count.value * multiplier.value);

// 3. React to Changes
const dispose = effect(() => {
  console.log(`Count: ${count.value}, Doubled: ${doubled.value}`);
});
// Output: "Count: 0, Doubled: 0"

// 4. Update State
count.value = 1;
// Output: "Count: 1, Doubled: 2"

// 5. Cleanup
dispose();
```

## Documentation

- [**API Reference**](./docs/API.md): Detailed usage of `atom`, `computed`, `effect`.
- [**Architecture**](./docs/ARCHITECTURE.md): Deep dive into the epoch-based propagation system.
- [**Benchmarks**](./docs/BENCHMARKS.md): Performance analysis.
- [**Onboarding**](./docs/ONBOARDING.md): Guide for contributors and new team members.

## License

MIT © [Jeongil Suk](https://github.com/but212)
