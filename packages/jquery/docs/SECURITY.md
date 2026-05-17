# Security & Sanitization Layer

This document details the security architecture, sanitization policies, and defensive measures implemented in `@but212/atom-effect-jquery` to mitigate Cross-Site Scripting (XSS) and DOM Clobbering vulnerabilities.

---

## Security Architecture

The library employs a multi-layered defense strategy that isolates untrusted data and utilizes native browser security primitives.

### 1. Prototype-Bound Bridge (Clobbering Protection)

To mitigate **DOM Clobbering**—where attackers shadow native DOM properties (e.g., `<input id="attributes">`)—the internal engine interacts with elements exclusively through prototype-bound descriptors.

- **Deterministic Access**: Methods such as `setAttribute`, `removeAttribute`, and `localName` are invoked via `Element.prototype` call/apply.
- **Integrity Guarantee**: This ensures the engine utilizes native browser logic even if instance-level properties have been compromised.

### 2. Inert Template-based Parsing

The `sanitizeHtml` engine utilizes detached `HTMLTemplateElement` contexts for all parsing operations.

- **Inert Context**: Content parsed within a `<template>` is strictly inert. Scripts do not execute, and external resources (e.g., images, iframes) are not requested during the sanitization phase.
- **Recursive Isolation**: The engine creates local parser and serializer instances for every call. This prevents state corruption during recursive operations, such as sanitizing content within a `srcdoc` attribute.

---

## Sanitization Policy

Reactive bindings that manipulate HTML content or attributes are governed by a strict `SanitizationPolicy`.

### Tag Neutralization

High-risk elements are neutralized by transforming them into safe `<span>` wrappers while preserving their attributes (subject to further scrubbing).

- **Executable Tags**: `script`, `iframe`, `object`, `embed`, `applet`.
- **Structural/State Tags**: `base`, `meta`, `link`, `style`, `title`, `noscript`, `form`, `isindex`.
- **Global Fragments**: `body`, `html`, `head`.

### Attribute Scrubbing

All element attributes undergo a rule-based inspection:

1. **Event Handler Blocking**: Attributes starting with `on` (e.g., `onclick`) are removed. Detected events are logged in a `data-unsafe-attr` attribute for diagnostic visibility.
2. **URI Protocol Validation**: Attributes designated as URL-carrying (e.g., `href`, `src`, `xlink:href`, `fill`, `filter`) are validated against a protocol whitelist. Malicious protocols (e.g., `javascript:`, `vbscript:`) result in the value being replaced with `data-unsafe-protocol:`.
3. **DOM Clobbering Defense**: Attributes such as `id` and `name` are blocked if their values match sensitive native property names (e.g., `attributes`, `tagName`, `parentNode`).
4. **SVG/SMIL Safety**: Animation attributes (`attributeName`, `from`, `to`, `values`) are scrubbed if they contain event handlers or dangerous URI patterns.

### Multi-pass Normalization

The engine performs recursive processing to expose hidden payloads:

- **Recursive Decoding**: HTML entities are decoded twice to neutralize double-encoding bypass attempts (e.g., `&#x26;#x6A;`).
- **Control Character Stripping**: Null bytes (`\0`), non-printable control characters (`\x00-\x1f`), and Unicode replacement characters (`\ufffd`) are removed.

---

## API Integration

### `$.fn.atomHtml(atom)`

Automatically routes all reactive updates through the `sanitizeHtml` engine. This is the primary defense for dynamic HTML injection.

### `$.fn.atomAttr(name, atom)`

Validates both the attribute name and value. Inline event handlers are blocked, and URI-based values are normalized and protocol-checked.

### `$.fn.atomCss(prop, atom)`

Filters CSS declarations to detect script injection patterns. It strips CSS comments to reveal hidden payloads and blocks `expression()`, `behavior:`, `-moz-binding`, and dangerous `url()` protocols.

### `$.fn.atomProp(name, atom)`

Enforces a strict sink blacklist. Access to structural properties like `innerHTML`, `outerHTML`, and `srcdoc` is blocked for reactive property bindings.

---

## Defensive Summary

| Vector | Defensive Mechanism |
| :--- | :--- |
| **XSS (Executable Tag)** | Neutralized to `<span>` via `blacklistedTags`. |
| **XSS (Event Handler)** | Stripped via `on*` pattern matching; logged to `data-unsafe-attr`. |
| **XSS (URI Protocol)** | Blocked via multi-pass normalization and protocol regex (`javascript:`, etc.). |
| **DOM Clobbering** | Prevented through **Prototype Hardening** (using descriptors). |
| **CSS Injection** | Filtered by `isDangerousCss` (detects `expression`, `url(javascript)`, etc.). |
| **Encoded Bypasses** | Neutralized by **Recursive Entity Decoding**. |
| **SVG/MathML Vectors** | Explicitly scrubbed via sensitive animation attribute filters. |

---

## Standards Compliance

The library is designed for compatibility with strict **Content Security Policy (CSP)** environments. It does not utilize `eval()`, `new Function()`, or inline event registration. By requiring **jQuery 4.0.0+**, the integration layer leverages modern browser security features and avoids legacy XSS vectors.
