# @but212/atom-effect-jquery

[![npm version](https://img.shields.io/npm/v/@but212/atom-effect-jquery.svg)](https://www.npmjs.com/package/@but212/atom-effect-jquery)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![ES2022+](https://img.shields.io/badge/target-ES2022%2B-blue)

Reactive DOM bindings and integration layer for jQuery, built upon the `atom-effect` core engine.

## Overview

This package enables declarative synchronization between reactive state and the DOM using jQuery collections and chainable methods. It features automated resource management via `MutationObserver` and provides specialized support for complex state flows, including form synchronization, list reconciliation, and SPA routing.

### Key Characteristics

- **Target**: ES2022+ environments.
- **Compatibility**: jQuery 4.0.0+ (ESM/CJS and UMD support).
- **Security**: Built-in sanitization engine to mitigate XSS and DOM Clobbering.
- **Lifecycle**: Automatic cleanup of reactive resources synchronized with DOM removal.

## Installation

### Package Manager

```bash
pnpm add @but212/atom-effect-jquery jquery
```

> [!IMPORTANT]
> This package requires `@but212/atom-effect` as a peer dependency.

### CDN (UMD)

```html
<script src="https://code.jquery.com/jquery-4.0.0.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@but212/atom-effect-jquery@0.32.1/dist/atom-effect-jquery.min.js"></script>

<script>
  // Initializing global state and safety net
  const { initAEJ } = AtomEffectJQuery;
  initAEJ({ autoCleanup: true });
</script>
```

## Usage

```javascript
import $ from 'jquery';
import '@but212/atom-effect-jquery';

// 1. Initialize State
const count = $.atom(0);

// 2. Declarative Binding
$('#count-display').atomText(count);

// 3. Update State via Interaction
$('#btn-increment').on('click', () => count.value++);

// 4. Reactive Visibility
const isWarningVisible = $.computed(() => count.value > 10);
$('#warning-msg').atomShow(isWarningVisible);
```

## Documentation

- [**API Reference**](./docs/API.md): Detailed specification of reactive methods (`atomBind`, `atomList`, `atomForm`, etc.).
- [**Common Patterns**](./docs/PATTERNS.md): Standard architectural patterns for UI updates, modals, and routing.
- [**Architecture & Design**](./docs/ARCHITECTURE.md): Implementation details of the binding pipeline and memory management.
- [**Security Guide**](./docs/SECURITY.md): Protocols for HTML sanitization and safe data flow.
- [**Lifecycle Invariants**](./docs/LIFECYCLE.md): Timing and behavior of reactive teardown.

## License

MIT © [Jeongil Suk](https://github.com/but212)
