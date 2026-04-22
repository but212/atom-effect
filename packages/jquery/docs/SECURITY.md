# Security: HTML Sanitization Guide

This guide explains the built-in sanitization layer and how to integrate [DOMPurify](https://github.com/cure53/DOMPurify) for production-grade XSS protection.

---

## Built-in Sanitization

`atomHtml` applies a built-in sanitization policy (`sanitizeHtml`) before injecting content. It addresses common security vectors but is **not** a comprehensive defense.

### What it blocks

`sanitizeHtml` (used by `atomHtml`):

| Vector | Action |
| ------ | ------ |
| `<script>`, `<iframe>`, `<object>`, `<embed>`, `<base>`, `<meta>`, `<applet>`, `<noscript>`, `<form>`, `<style>`, `<link>` | Tag stripped and transformed into inert `<span>` wrappers. |
| `onclick`, `onerror`, etc. (`on*` attributes) | Replaced with a single, comma-separated `data-unsafe-attr` list. |
| `javascript:`, `vbscript:`, `data:` protocols | Neutralized (Replaced with `data-unsafe-protocol:`). Strips all internal whitespace and handles decoded entities. |
| `srcset` hijacking | Each comma-separated URL is individually normalized and validated. |
| Untrusted data URIs (`text/html`, `application/javascript`, `image/svg+xml`, etc.) | Neutralized. Covers both standalone attributes and `srcdoc` sinks. |
| CSS expressions & protocol smuggling | Normalizes CSS by **stripping comments** (`/*...*/`) first, then matches against a data-driven array of threat patterns. |
| Entities (`&#NNN;`, `&#xHH;`, `&colon;`, etc.) | **Decoded first** in the normalization phase. Correctively handles optional trailing semicolons. |
| Null bytes / control characters | **Stripped after entity decoding** to prevent hidden payloads. |
| XML processing instructions (`<?...?>`) | Stripped |

`bindAttr` (used by `atomAttr` / `atomBind.attr`):

| Vector | Action |
| ------ | ------ |
| `on*` attribute names (e.g., `onclick`) | Silently blocked (attribute not set) |
| `javascript:` / `vbscript:` / `data:` in URL attributes | Silently blocked. Returns normalized safe URLs to prevent entity bypasses. |
| SVG URL attributes (`fill`, `filter`, `mask`, etc.) | Sanitized for untrusted protocols |
| `srcset` and `srcdoc` | Subject to individual URL validation and explicit content scanning respectively. |

`bindCss` (used by `atomCss` / `atomBind.css`):

| Vector | Action |
| ------ | ------ |
| `url(javascript:...)` / `url(vbscript:...)` in CSS values | Silently blocked (style not applied) |

`bindProp` (used by `atomProp` / `atomBind.prop`):

| Vector | Action |
| ------ | ------ |
| `innerHTML`, `outerHTML`, `srcdoc` (HTML injection sinks) | Silently blocked |
| `__proto__`, `constructor`, `prototype` (prototype pollution) | Silently blocked |
| `on*` property names (e.g., `onclick`) | Silently blocked |
| `javascript:` / `vbscript:` in mapped URL properties (e.g., `src`, `href`) | Silently blocked |

### What it does NOT block

- Non-standard event handlers beyond `on*` pattern in specialized tags (e.g., rare attribute-based execution in legacy browsers)
- Mutation-based XSS (mXSS)
- CSS-based data exfiltration (beyond identified protocol vectors)

**For production applications handling user-generated content, use of a comprehensive library like DOMPurify is recommended.**

---

## Policy-Driven Architecture

The sanitization layer uses a **Data-Driven Policy** architecture. Instead of hardcoded logic, security rules are defined in a `SanitizationPolicy` object.

### Customizing the Policy

You can extend the `DEFAULT_POLICY` or provide a completely new one to `sanitizeHtml`:

```typescript
import { sanitizeHtml, DEFAULT_POLICY } from '@but212/atom-effect-jquery';

const myPolicy = {
  ...DEFAULT_POLICY,
  // Allow iframes for specific trusted sources
  allowedTags: [...DEFAULT_POLICY.allowedTags, 'iframe'],
};

// Use the policy manually
const safe = sanitizeHtml(untrusted, myPolicy);
```

### Global Policy (Experimental)

Future versions will allow injecting a global policy to override behavior across all `atomBind` and `atomHtml` calls. Currently, policy injection is available at the utility function level.

---

## DOMPurify Integration

### Installation

npm

```bash
npm install dompurify
npm install -D @types/dompurify  # TypeScript users
```

script tag

```html
<script type="text/javascript" src="dist/purify.min.js"></script>
```

### Basic Usage with `atomHtml`

```javascript
import DOMPurify from 'dompurify';

const rawContent = $.atom('<p>User <b>content</b></p>');

// Sanitize reactively — DOMPurify runs whenever rawContent changes
const safeContent = $.computed(() => DOMPurify.sanitize(rawContent.value));
$('#output').atomHtml(safeContent);
```

### Custom Configuration

Allow specific tags or attributes beyond DOMPurify defaults:

```javascript
const purifyConfig = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  ALLOW_DATA_ATTR: false,
};

const safeHtml = $.computed(() =>
  DOMPurify.sanitize(rawHtml.value, purifyConfig)
);
$('#content').atomHtml(safeHtml);
```

### Usage with `atomList`

When rendering lists with user-supplied HTML in the `render` callback:

```javascript
import DOMPurify from 'dompurify';

$('#comments').atomList(commentsAtom, {
  key: c => c.id,
  render: (comment) => {
    const safeBody = DOMPurify.sanitize(comment.body);
    return `<div class="comment">${safeBody}</div>`;
  },
  bind: ($el, comment) => {
    $el.find('.author').text(comment.author);
  }
});
```

### Usage with `atomBind`

```javascript
const safeContent = $.computed(() => DOMPurify.sanitize(rawHtml.value));

$('#card').atomBind({
  html: safeContent,
  class: { 'has-content': $.computed(() => !!rawHtml.value) },
});
```

---

## Content Security Policy (CSP)

DOMPurify works well with strict CSP policies. If your site uses a CSP that blocks inline styles or scripts:

```javascript
// Tell DOMPurify to strip inline styles
const safeHtml = DOMPurify.sanitize(dirty, {
  FORBID_ATTR: ['style'],
  FORBID_TAGS: ['style'],
});
```

For `nonce`-based CSP setups, note that DOMPurify does not add nonces to sanitized output. Inline styles and scripts in user content will be blocked by CSP (which is the intended behavior).

---

## Summary

| Scenario | Recommendation |
| -------- | -------------- |
| Static, developer-controlled HTML | Built-in `sanitizeHtml` is sufficient |
| User-generated content (comments, profiles) | Use DOMPurify |
| Rich text editor output | Use DOMPurify with custom `ALLOWED_TAGS` |
| Markdown rendering | Sanitize **after** markdown-to-HTML conversion |
