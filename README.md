# atom-effect

[![npm version](https://img.shields.io/npm/v/@but212/atom-effect.svg)](https://www.npmjs.com/package/@but212/atom-effect)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/but212/atom-effect)

A lightweight, high-performance reactive state management ecosystem for TypeScript/JavaScript.

## Packages

| Package | Version | Description |
| --- | --- | --- |
| [@but212/atom-effect](./packages/core) | [![npm](https://img.shields.io/npm/v/@but212/atom-effect.svg)](https://www.npmjs.com/package/@but212/atom-effect) | Core reactive primitives (`atom`, `computed`, `effect`) |
| [@but212/atom-effect-jquery](./packages/jquery) | [![npm](https://img.shields.io/npm/v/@but212/atom-effect-jquery.svg)](https://www.npmjs.com/package/@but212/atom-effect-jquery) | jQuery reactive bindings |

## Quick Start

### Core Library

```bash
npm i @but212/atom-effect
```

```html
<script src="https://cdn.jsdelivr.net/npm/@but212/atom-effect@latest"></script>
```

```typescript
import { atom, computed, effect } from '@but212/atom-effect';

const count = atom(0);
const doubled = computed(() => count.value * 2);

effect(() => console.log(`Count: ${count.value}`));

count.value++; // Auto-updates
```

### jQuery Bindings

```bash
npm i @but212/atom-effect-jquery jquery
```

```html
<script src="https://cdn.jsdelivr.net/npm/@but212/atom-effect-jquery@latest"></script>
```

```javascript
import '@but212/atom-effect-jquery';

const count = $.atom(0);
$('#counter').atomText(count);
```

## Documentation

- **Core API & Benchmarks**: [packages/core/README.md](./packages/core/README.md)
- **jQuery API**: [packages/jquery/README.md](./packages/jquery/README.md)
- **Changelog**: [CHANGELOG.md](./CHANGELOG.md)

## Development

```bash
pnpm install
pnpm build
pnpm test:run
```

## License

MIT © [Jeongil Suk](https://github.com/but212)
