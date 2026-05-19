# Migration Guide: Atom-Effect v0.33.0 & v0.34.0

This guide provides instructions for migrating your codebase to the latest versions of `atom-effect`. Several breaking changes and deprecations have been introduced to improve performance, bundle size (tree-shaking), and development experience.

---

## 1. ES2022 Migration (v0.33.0)

### What Changed?

Starting with version **v0.33.0**, the library targets **ES2022**. The internal engine has been refactored to utilize modern JavaScript features, most notably **private class fields (`#`)**.

### Why?

ES2022 private fields provide native encapsulation, preventing accidental access to internal reactive state. This shift also stabilizes V8 hidden classes, leading to better runtime performance.

### How to Migrate?

Ensure your environment (Node.js or Browser) supports ES2022. Most modern environments (Node 16.11+, Chrome 91+, Safari 15+) already support these features. If you are using a transpiler (like Babel or SWC), ensure your target is set to ES2022 or higher to avoid unnecessary polyfills.

---

## 2. Error Handling & Types (v0.33.0 & v0.34.0)

### Deprecation of Instance Methods

The `AtomError` class and its subclasses no longer prioritize instance methods for diagnostic tasks. Methods `getChain()` and `toJSON()` are **deprecated in v0.33.0** and will be **removed in v0.34.0**.

#### How to Migrate?

Replace instance method calls with standalone functions imported from the core package.

**Before:**

```typescript
const chain = error.getChain();
const json = error.toJSON();
```

**After:**

```typescript
import { getErrorChain, serializeError } from '@but212/atom-effect';

const chain = getErrorChain(error);
const json = serializeError(error);
```

### Type Relocation (v0.33.0)

`AtomErrorConstructor` and `AtomErrorJSON` types have been relocated to the core types module.

#### How to Migrate?

Update your imports if you were referencing these types from internal paths or specific error modules.

```typescript
// Correct import
import type { AtomErrorConstructor, AtomErrorJSON } from '@but212/atom-effect';
```

---

## 3. Build System & Distribution (v0.33.0)

### Partitioned Build Process

The build process is now partitioned into specialized targets: `types`, `lib` (ESM/CJS), and `bundle` (UMD).

#### How to Migrate?

Always use the documented entry points. Avoid importing from internal paths like `@but212/atom-effect/dist/core/base`.

**Correct usage:**

```typescript
import { atom, computed } from '@but212/atom-effect';
```

### jQuery Externalization

In the jQuery package (`@but212/atom-effect-jquery`), the core `@but212/atom-effect` package is now externalized in ESM and CJS builds.

#### How to Migrate?

You must ensure `@but212/atom-effect` is installed as a peer dependency in your project.

### CDN Path Changes

The default entry point for CDNs has changed to favor explicit bundle paths.

#### How to Migrate?

Update your `<script>` tags to use the explicit UMD bundle:

```html
<!-- Before -->
<script src="https://cdn.jsdelivr.net/npm/@but212/atom-effect-jquery@0.32.1/index.js"></script>

<!-- After (Recommended) -->
<script src="https://cdn.jsdelivr.net/npm/@but212/atom-effect-jquery@0.33.0/dist/atom-effect-jquery.min.js"></script>
```

---

## 4. Debug System (v0.33.0)

### What Changed?

The `debug` utility has been refactored into an encapsulated class-based structure for both core and jQuery packages.

### How to Migrate?

In jQuery, access the debug controller via the jQuery namespace.

```typescript
import $ from '@but212/atom-effect-jquery';

// Enable visual debugging
$.debug.enabled = true;
```

---

## Need Help?

If you encounter any issues during migration, please open an issue on our [GitHub repository](https://github.com/but212/atom-effect/issues).
