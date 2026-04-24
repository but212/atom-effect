# Security & Sanitization Layer

`atom-effect-jquery` implements a robust, industry-grade security layer designed to prevent Cross-Site Scripting (XSS) and DOM Clobbering attacks. This document details the architectural measures and sanitization policies enforced by the library.

---

## Security Architecture

The library utilizes a **Data-Driven Security Policy** combined with a **Safe DOM Bridge** to neutralize malicious payloads before they are committed to the document.

### 1. Safe DOM Bridge (Clobbering Protection)

To prevent **DOM Clobbering** attacks—where malicious elements (like `<input id="attributes">`) shadow native property descriptors—the sanitizer interacts with the DOM exclusively via native prototypes.

- Accesses `attributes`, `localName`, and `innerHTML` using `Element.prototype` descriptors.
- Ensures native logic is used even if the target element's instance properties have been tampered with.

### 2. Hybrid Parsing Strategy

The `sanitizeHtml` engine automatically switches between parsing strategies to ensure content integrity:

- **Fragment Parsing**: Uses a detached `<template>` element for standard HTML fragments.
- **Document Parsing**: Uses `document.implementation.createHTMLDocument` when top-level tags like `<body>` or `<html>` are detected, preventing the browser from stripping them.

---

## Sanitization Policy

All reactive bindings that inject HTML or manipulate attributes are governed by the `SanitizationPolicy`.

### Blocked Elements

The following tags are considered high-risk and are neutralized by transforming them into safe `<span>` containers:

- **Executable**: `<script>`, `<iframe>`, `<object>`, `<embed>`, `<applet>`
- **Structural/State**: `<base>`, `<meta>`, `<link>`, `<title>`, `<noscript>`, `<form>`, `<isindex>`
- **Global**: `<body>`, `<html>`, `<head>` (Neutralized to prevent full-page hijacking)

### Attribute Protection

The library performs deep inspection of all element attributes:

- **Event Handlers**: Any attribute starting with `on` (e.g., `onclick`) is removed and logged in a `data-unsafe-attr` attribute.
- **Attribute Name Smuggling**: Dangerous URI protocols detected within attribute names (e.g., `<div javascript:alert(1)="...">`) are blocked.
- **Foreign Contexts**: SVG/MathML animation attributes (`attributeName`, `from`, `to`, `values`) are scrubbed if they point to event handlers or dangerous protocols.

### URI & Protocol Sanitization

The library employs **Advanced Normalization** to reveal hidden protocols:

- **Entity Decoding**: Decodes hex (`&#x61;`), decimal (`&#97;`), and named (`&colon;`) entities.
- **Control Character Stripping**: Removes null bytes (`\0`), control characters (`\x01-\x1f`), and Unicode replacement characters ().
- **Protocol Blocking**: Neutralizes `javascript:`, `vbscript:`, and dangerous `data:` types (e.g., `text/html`, `image/svg+xml`).

---

## API Integration

### `$.fn.atomHtml(atom)`

Automatically passes all content through `sanitizeHtml` before rendering. This is the primary defense for dynamic content injection.

### `$.fn.atomAttr(name, atom)`

Validates the `name` and `value` against the security policy.

- If the attribute name is an event handler or protocol, it is blocked.
- If the value for a URI-based attribute (like `href`) is dangerous, it is replaced with `data-unsafe-protocol:`.

### `$.fn.atomCss(prop, atom)`

Validates CSS values against dangerous patterns:

- Blocks `expression()`, `behavior:`, and `-moz-binding`.
- Blocks `url()` values containing dangerous protocols.

### `$.fn.atomProp(name, atom)`

Strictly guards dangerous sinks. Properties like `innerHTML`, `outerHTML`, and `srcdoc` are **completely blocked** from reactive property binding.

---

## Best Practices

### Handling Untrusted Content

While the built-in sanitizer is highly effective, we recommend using [DOMPurify](https://github.com/cure53/DOMPurify) for processing complex, user-generated rich text in high-stakes environments.

```javascript
// Integrating DOMPurify with atom-effect
const safeHtml = $.computed(() => DOMPurify.sanitize(userInput.value));
$el.atomHtml(safeHtml);
```

### Content Security Policy (CSP)

The library is fully compatible with strict CSPs. It does not use `eval()` or `new Function()`. Since the library requires **jQuery 4.0.0+**, it benefits from modern browser security features and avoids legacy XSS vectors found in older jQuery versions.

---

## Summary of Defense

| Vector | Protection Mechanism |
| :--- | :--- |
| **XSS (Tag)** | Neutralized to `<span>` via `blacklistedTags`. |
| **XSS (Event)** | Stripped via `on*` pattern matching. |
| **XSS (Protocol)** | Blocked via `isDangerousUri` (with normalization). |
| **DOM Clobbering** | Prevented via `DOM_PROTOTYPE_BRIDGE`. |
| **CSS Injection** | Blocked via `cssDangerPatterns`. |
| **SVG/MathML Vectors** | Explicitly scrubbed via animation attribute checks. |
| **Srcset/Srcdoc** | Recursively sanitized or segment-validated. |
