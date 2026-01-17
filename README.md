# atom-effect

[![npm version](https://img.shields.io/npm/v/@but212/atom-effect.svg)](https://www.npmjs.com/package/@but212/atom-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/but212/atom-effect)

A lightweight, high-performance reactive state management ecosystem for TypeScript/JavaScript.

## Packages

| Package | Version | Description |
| --------- | --------- | ------------- |
| [@but212/atom-effect](./packages/core) | [![npm](https://img.shields.io/npm/v/@but212/atom-effect.svg)](https://www.npmjs.com/package/@but212/atom-effect) | Core reactive primitives (`atom`, `computed`, `effect`) |
| [@but212/atom-effect-jquery](./packages/jquery) | [![npm](https://img.shields.io/npm/v/@but212/atom-effect-jquery.svg)](https://www.npmjs.com/package/@but212/atom-effect-jquery) | jQuery reactive bindings |

## Quick Start

### Core Library

```bash
npm i @but212/atom-effect
```

```typescript
import { atom, computed, effect } from '@but212/atom-effect';

const count = atom(0);
const doubled = computed(() => count.value * 2);

effect(() => console.log(`Count: ${count.value}, Doubled: ${doubled.value}`));

count.value = 5; // Logs: "Count: 5, Doubled: 10"
```

### jQuery Bindings

```bash
npm i @but212/atom-effect-jquery jquery
```

```javascript
import '@but212/atom-effect-jquery';

const count = $.atom(0);

$('#counter').atomText(count);
$('#increment').on('click', () => count.value++);
```

## Features

- **Zero Dependencies** - Core library has no external dependencies
- **Full TypeScript Support** - Strict type checking with branded types
- **High Performance** - Object pooling, epoch-based tracking, lazy evaluation
- **Async First-Class** - Async computed with automatic state tracking
- **Developer Friendly** - Circular dependency detection, infinite loop protection

## Development

This is a monorepo managed with [pnpm workspaces](https://pnpm.io/workspaces) and [Turborepo](https://turbo.build/).

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test:run

# Lint all packages
pnpm lint

# Type check all packages
pnpm typecheck
```

## Documentation

- **Core**: See [packages/core/README.md](./packages/core/README.md)
- **jQuery**: See [packages/jquery/README.md](./packages/jquery/README.md)
- **Benchmarks**: See [packages/core/docs/BENCHMARKS.md](./packages/core/docs/BENCHMARKS.md)
- **Changelog**: See [CHANGELOG.md](./CHANGELOG.md)

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

## License

MIT © [Jeongil Suk](https://github.com/but212)
