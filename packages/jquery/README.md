# @but212/atom-effect-jquery

[![npm version](https://img.shields.io/npm/v/@but212/atom-effect-jquery.svg)](https://www.npmjs.com/package/@but212/atom-effect-jquery)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![ES2021+](https://img.shields.io/badge/target-ES2021%2B-blue)

> **Browser Support**: Targets ES2021+ environments. Legacy browsers (IE11) are **NOT** supported. Use generic jQuery for them.

## Quick Start

### Installation

```bash
npm install @but212/atom-effect-jquery jquery
```

### CDN

```html
<!-- jquery -->
<script src="https://code.jquery.com/jquery-4.0.0.min.js"></script>
<!-- atom-effect-jquery -->
<script src="https://cdn.jsdelivr.net/npm/@but212/atom-effect-jquery@0.24.1"></script>
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

## Security Note

For rendering HTML content (`atomHtml`), this library includes **minimal** XSS protection.
For production applications dealing with user-generated content, use **[DOMPurify](https://github.com/cure53/DOMPurify)**.

```javascript
import DOMPurify from 'dompurify';
// Always sanitize before binding HTML
$('#content').atomHtml($.computed(() => DOMPurify.sanitize(rawHTML.value)));
```

## Documentation

- [**API Reference**](./docs/API.md): Full list of bindings (`atomText`, `atomVal`, `atomBind`...).
- [**Architecture**](./docs/ARCHITECTURE.md): Internal design — binding pipeline, lifecycle management, list reconciliation.
- [**Security Guide**](./docs/SECURITY.md): HTML sanitization and DOMPurify integration.
- [**Common Patterns**](./docs/PATTERNS.md): How to handle async loading, modals, and legacy plugins.

## License

MIT © [Jeongil Suk](https://github.com/but212)
