# atom-effect

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/but212/atom-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![ES2022+](https://img.shields.io/badge/target-ES2022%2B-blue)

A high-performance monorepo for reactive state management with asynchronous orchestration.

## Overview

The `atom-effect` project provides a set of reactive primitives designed for ES2022+ environments. It utilizes an epoch-based propagation engine to ensure deterministic state updates and efficient resource management. The library is built for performance and type safety, with first-class support for asynchronous derived states.

## Packages

| Package | Version | Role | Description |
| --- | --- | --- | --- |
| **[@but212/atom-effect](./packages/core)** | `0.33.1` | Core Engine | Core reactive primitives: `atom`, `computed`, and `effect`. |
| **[@but212/atom-effect-jquery](./packages/jquery)** | `0.33.1` | Adapter | Reactive DOM bindings, form synchronization, and SPA routing for jQuery. |

## Quick Start

### Installation

```bash
pnpm add @but212/atom-effect
```

### Usage (Core)

```typescript
import { atom, computed, effect } from '@but212/atom-effect';

// Initialize mutable state
const count = atom(0);

// Define derived state (automatically cached)
const double = computed(() => count.value * 2);

// Register a reactive side-effect
effect(() => console.log(`Count: ${count.value}, Double: ${double.value}`));

// Updating state triggers deterministic propagation
count.value++; // Logs: "Count: 1, Double: 2"
```

## Monorepo Development

This project uses `pnpm` workspaces and `turbo` for efficient build and test orchestration.

### Common Commands

```bash
# Install all workspace dependencies
pnpm install

# Build all packages across the workspace
pnpm run build

# Execute the test suite for all packages
pnpm run test

# Run type checking and linting
pnpm run typecheck
pnpm run lint

# Run benchmarks to detect performance regressions
pnpm run bench

# Clean build artifacts and caches
pnpm run clean
```

## Documentation & Resources

- **Core Primitives**: [API Reference](./packages/core/docs/API.md) | [Architecture](./packages/core/docs/ARCHITECTURE.md) | [Onboarding](./packages/core/docs/ONBOARDING.md)
- **jQuery Adapter**: [API Reference](./packages/jquery/docs/API.md) | [Security Guide](./packages/jquery/docs/SECURITY.md) | [Lifecycle](./packages/jquery/docs/LIFECYCLE.md)
- **Contribution**: [Development Guidelines](./CONTRIBUTING.md)
- **Release History**: [Changelog](./CHANGELOG.md)

## License

MIT © [Jeongil Suk](https://github.com/but212)
