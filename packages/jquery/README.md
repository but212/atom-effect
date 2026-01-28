# @but212/atom-effect-jquery

[![npm version](https://img.shields.io/npm/v/@but212/atom-effect-jquery.svg)](https://www.npmjs.com/package/@but212/atom-effect-jquery)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Installation

```bash
npm install @but212/atom-effect-jquery jquery
```

### CDN

```html
<script src="https://cdn.jsdelivr.net/npm/@but212/atom-effect-jquery@0.17.0"></script>
```

### Usage

Instead of manually updating the DOM in 5 different places, you define the relationship **once**.

```javascript
import $ from 'jquery';
import '@but212/atom-effect-jquery';

// 1. Define State
const count = $.atom(0);

// 2. Bind to DOM (Declarative)
$('#count-display').atomText(count);
$('#btn-increment').on('click', () => count.value++);

// 3. Conditional UI
const isBig = $.computed(() => count.value > 10);
$('#warning-msg').atomShow(isBig);
```

## Documentation

- [**API Reference**](./docs/API.md): Full list of bindings (`atomText`, `atomVal`, `atomBind`...).
- [**Common Patterns**](./docs/PATTERNS.md): How to handle async loading, modals, and legacy plugins.

## License

MIT © [Jeongil Suk](https://github.com/but212)
