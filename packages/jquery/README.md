# @but212/atom-effect-jquery

> **Bring modern, fine-grained reactivity to your legacy jQuery codebase.**  
> Stop writing spaghetti code `$('#...').val(...)` callbacks. Bind your state once, and let it update the DOM automatically.

[![npm version](https://img.shields.io/npm/v/@but212/atom-effect-jquery.svg)](https://www.npmjs.com/package/@but212/atom-effect-jquery)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why this exists

You have a massive jQuery application.

- **Problem**: Syncing state between multiple DOM elements is a nightmare of event handlers and `.text()` calls.
- **Solution**: Use `atom` for state, and bind it directly to DOM elements. The DOM updates automatically when state changes.
- **Bonus**: Automatic cleanup when elements are removed (via `$.cleanData`).

## Quick Start

### Installation

```bash
npm install @but212/atom-effect-jquery jquery
```

### Usage (The "Aha!" Moment)

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
