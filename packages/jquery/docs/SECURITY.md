# Security: HTML Sanitization Guide

This guide explains the built-in sanitization layer and how to integrate [DOMPurify](https://github.com/cure53/DOMPurify) for production-grade XSS protection.

---

## Built-in Sanitization

`atomHtml` applies a lightweight filter (`sanitizeHtml`) before injecting content. It handles common vectors but is **not** a complete defense.

### What it blocks

`sanitizeHtml` (used by `atomHtml`):

| Vector | Action |
| ------ | ------ |
| `<script>`, `<iframe>`, `<object>`, `<embed>`, `<base>`, `<meta>`, `<applet>`, `<noscript>`, `<form>`, `<style>`, `<link>` | Tag removed entirely (loop until stable) |
| `onclick`, `onerror`, etc. (`on*` attributes) | Replaced with `data-unsafe-attr=` |
| `javascript:`, `vbscript:` protocols | Replaced with `data-unsafe-protocol:` |
| Dangerous data URIs (`text/html`, `application/javascript`, `image/svg+xml`, etc.) | Replaced with `data-unsafe-protocol:` |
| CSS `expression()`, `behavior:`, `-moz-binding:`, obfuscated protocol sequences | Replaced with `data-unsafe-css:` |
| Entities (`&#NNN;`, `&#xHH;`, `&colon;`, `&Tab;`, `&NewLine;`) | Decoded to literals first to prevent protocol smuggling |
| Null bytes / control characters | Stripped |
| XML processing instructions (`<?...?>`) | Stripped |

`bindAttr` (used by `atomAttr` / `atomBind.attr`):

| Vector | Action |
| ------ | ------ |
| `on*` attribute names (e.g., `onclick`) | Silently blocked (attribute not set) |
| `javascript:` / `vbscript:` in URL attributes (`href`, `src`, `action`, etc.) | Silently blocked |

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

- Attribute-based injection via lesser-known tags (e.g., `<svg>`, `<math>` event handlers beyond `on*` pattern)
- Mutation-based XSS (mXSS)
- CSS-based data exfiltration

**For production applications handling user-generated content, always use DOMPurify.**

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
