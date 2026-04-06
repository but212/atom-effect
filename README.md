# atom-effect

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/but212/atom-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![ES2021+](https://img.shields.io/badge/target-ES2021%2B-blue)

A reactive state management library with first-class async support.

## Packages

| Package | Version | Description |
| --- | --- | --- |
| [@but212/atom-effect](./packages/core) | [![npm](https://img.shields.io/npm/v/@but212/atom-effect.svg)](https://www.npmjs.com/package/@but212/atom-effect) | Core reactive primitives (`atom`, `computed`, `effect`) |
| [@but212/atom-effect-jquery](./packages/jquery) | [![npm](https://img.shields.io/npm/v/@but212/atom-effect-jquery.svg)](https://www.npmjs.com/package/@but212/atom-effect-jquery) | jQuery reactive bindings |

## Quick Start

```bash
pnpm add @but212/atom-effect
```

```typescript
import { atom, computed, effect } from '@but212/atom-effect';

const count = atom(0);
const double = computed(() => count.value * 2);

effect(() => console.log(count.value, double.value));

count.value++; // logs: 1, 2
```

→ See **[@but212/atom-effect README](./packages/core/README.md)** for full documentation.

## Development

```bash
pnpm install
pnpm build
pnpm test

# Run a command in a specific package
pnpm --filter @but212/atom-effect <command>
pnpm --filter @but212/atom-effect-jquery <command>
```

## Documentation

- [Architecture & Design](./packages/core/docs/ARCHITECTURE.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Changelog](./CHANGELOG.md)

## License

MIT © [Jeongil Suk](https://github.com/but212)
