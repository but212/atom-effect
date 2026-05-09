# @but212/atom-effect-jquery

[![npm version](https://img.shields.io/npm/v/@but212/atom-effect-jquery.svg)](https://www.npmjs.com/package/@but212/atom-effect-jquery)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![ES2021+](https://img.shields.io/badge/target-ES2021%2B-blue)

Reactive DOM bindings for jQuery, implemented as an integration layer for the `atom-effect` core.

## Overview

This package enables declarative synchronization between reactive state and the DOM using jQuery selectors and chainable methods. It enforces automatic resource management via `MutationObserver` and provides specialized support for complex state flows, including IME composition and list reconciliation.

- **Target**: ES2021+
- **Compatibility**: jQuery 3.x+
- **Environment**: Modern browsers (legacy environments such as IE11 are not supported).

## Installation

### Package Manager

```bash
npm install @but212/atom-effect-jquery jquery
```

### CDN

```html
<!-- jQuery -->
<script src="https://code.jquery.com/jquery-4.0.0.min.js"></script>
<!-- atom-effect-jquery -->
<script src="https://cdn.jsdelivr.net/npm/@but212/atom-effect-jquery@0.32.1"></script>

<script>
  // Initializing global state
  const { initAEJ } = AtomEffectJQuery;
  initAEJ({ autoCleanup: true });
</script>
```

## Usage

Bindings allow for declarative relationship definitions between reactive atoms and DOM elements.

```javascript
import $ from 'jquery';
import '@but212/atom-effect-jquery';

// 1. Initialize State
const count = $.atom(0);

// 2. Declarative Binding
$('#count-display').atomText(count);

// 3. Interaction
$('#btn-increment').on('click', () => count.value++);

// 4. Derived State
const isThresholdReached = $.computed(() => count.value > 10);
$('#warning-msg').atomShow(isThresholdReached);
```

## Security

The `atomHtml` method renders raw HTML strings. To mitigate XSS risks, ensure input is sanitized before synchronization.

```javascript
import DOMPurify from 'dompurify';

// Sanitize before binding to the DOM
$('#content').atomHtml($.computed(() => DOMPurify.sanitize(rawHTML.value)));
```

## Documentation

- [**API Reference**](./docs/API.md): Detailed specification of reactive methods (`atomText`, `atomVal`, `atomList`, etc.).
- [**Architecture**](./docs/ARCHITECTURE.md): Internal implementation details including the binding pipeline and memory management.
- [**Security**](./docs/SECURITY.md): Protocols for HTML sanitization and secure data flow.

## License

MIT © [Jeongil Suk](https://github.com/but212)
