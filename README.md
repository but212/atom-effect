# atom-effect

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/but212/atom-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![ES2022+](https://img.shields.io/badge/target-ES2022%2B-blue)

A monorepo for reactive state management with asynchronous orchestration.

## Overview

The `atom-effect` project implements reactive primitives for JavaScript environments. It enforces type safety, state predictability, and automated resource management.

## Packages

| Package | Role | Description |
| --- | --- | --- |
| [@but212/atom-effect](./packages/core) | Core Engine | Reactive primitives: `atom`, `computed`, and `effect`. |
| [@but212/atom-effect-jquery](./packages/jquery) | jQuery Adapter | Reactive DOM bindings and lifecycle management for jQuery. |

## Quick Start

### Installation

```bash
pnpm add @but212/atom-effect
```

### Usage

```typescript
import { atom, computed, effect } from '@but212/atom-effect';

// Initialize reactive state
const count = atom(0);

// Define derived computed value
const double = computed(() => count.value * 2);

// Register side-effect
effect(() => console.log(`Count: ${count.value}, Double: ${double.value}`));

// Update state triggers synchronous/batched propagation
count.value++; // Logs: "Count: 1, Double: 2"
```

Refer to the **[@but212/atom-effect README](./packages/core/README.md)** for detailed documentation.

## Monorepo Development

This project uses `pnpm` workspaces for dependency management and build orchestration.

### Commands

```bash
# Install dependencies across all packages
pnpm install

# Build all packages (types, lib, and bundle)
pnpm run build

# Build specific targets
pnpm run build:lib    # ESM/CJS only
pnpm run build:bundle # UMD bundle only

# Execute test suite for all projects
pnpm test

# Run a specific command in a targeted package
pnpm --filter @but212/atom-effect <command>
pnpm --filter @but212/atom-effect-jquery <command>
```

## Resources

- **Core Architecture**: [Design Philosophy & Internal Mechanics](./packages/core/docs/ARCHITECTURE.md)
- **Contribution**: [Development Guidelines & PR Process](./CONTRIBUTING.md)
- **History**: [Release Notes & Migration Guides](./CHANGELOG.md)

## License

MIT © [Jeongil Suk](https://github.com/but212)
