# HTML Sanitization

This document describes the built-in sanitization layer and the integration of third-party libraries such as [DOMPurify](https://github.com/cure53/DOMPurify) for XSS protection.

---

## Built-in Sanitization

The `atomHtml` method utilizes `sanitizeHtml` to process content before injection. This internal layer targets common security vectors but is not intended to be a comprehensive defense against all mutation-based XSS (mXSS) or sophisticated injection attacks.

### Blocked Elements and Attributes

`sanitizeHtml` (used by `atomHtml`):

| Vector | Action |
| ------ | ------ |
| `<script>`, `<iframe>`, `<object>`, `<embed>`, `<base>`, `<meta>`, `<applet>`, `<noscript>`, `<form>`, `<style>`, `<link>`, `<title>` | Tag is transformed into an inert `<span>` wrapper. |
| `onclick`, `onerror`, etc. (`on*` attributes) | Replaced with a `data-unsafe-attr` list. |
| `javascript:`, `vbscript:`, `data:` protocols | Neutralized (replaced with `data-unsafe-protocol:`). |
| `srcset` hijacking | Comma-separated URLs are individually validated. |
| Dangerous data URIs (`text/html`, etc.) | Neutralized. |
| CSS expressions & protocol smuggling | Normalizes CSS by stripping comments before matching against threat patterns. |
| Obfuscated Entities | Decoded during the normalization phase. |
| Null bytes / control characters | Stripped after entity decoding. |
| XML processing instructions (`<?...?>`) | Stripped. |

`bindAttr` (used by `atomAttr` / `atomBind.attr`):

| Vector | Action |
| ------ | ------ |
| `on*` attribute names | Blocked (attribute is not set). |
| `javascript:` / `vbscript:` in URL attributes | Blocked. |
| SVG URL attributes (`fill`, `filter`, etc.) | Sanitized for untrusted protocols. |
| `srcset` and `srcdoc` | Subject to URL validation and content scanning. |

`bindCss` (used by `atomCss` / `atomBind.css`):

| Vector | Action |
| ------ | ------ |
| `url(javascript:...)` in CSS values | Blocked (style is not applied). |

`bindProp` (used by `atomProp` / `atomBind.prop`):

| Vector | Action |
| ------ | ------ |
| `innerHTML`, `outerHTML`, `srcdoc` | Blocked (properties are not set). |
| `__proto__`, `constructor`, `prototype` | Blocked to prevent prototype pollution. |
| `on*` property names | Blocked. |
| `javascript:` / `vbscript:` in URL properties | Blocked. |

### Limitations

The built-in layer does not block:

- Mutation-based XSS (mXSS) resulting from browser-specific parsing quirks.
- CSS-based data exfiltration beyond identified protocol vectors.
- Complex attribute-based execution in legacy browsers.

**Applications processing untrusted user-generated content should use a dedicated security library such as DOMPurify.**

---

## Policy-Driven Architecture

The sanitization logic is governed by a `SanitizationPolicy` object. This architecture separates the security data from the execution logic.

### Customizing the Policy

The `DEFAULT_POLICY` can be extended or replaced when calling `sanitizeHtml`:

```typescript
import { sanitizeHtml, DEFAULT_POLICY } from '@but212/atom-effect-jquery';

const myPolicy = {
  ...DEFAULT_POLICY,
  // Allow iframes by removing them from the blacklistedTags array
  blacklistedTags: DEFAULT_POLICY.blacklistedTags.filter(t => t !== 'iframe'),
};

const safe = sanitizeHtml(untrusted); // Uses default
```

Note: Global policy injection is not yet available at the configuration level; it must be passed to individual utility calls.

---

## DOMPurify Integration

### Usage with `atomHtml`

To use DOMPurify with reactive atoms, sanitize the content within a `computed` atom:

```javascript
import DOMPurify from 'dompurify';

const rawContent = $.atom('<p>User <b>content</b></p>');

const safeContent = $.computed(() => DOMPurify.sanitize(rawContent.value));
$('#output').atomHtml(safeContent);
```

### Usage in Lists and Components

When rendering lists or mounting components that process user-supplied HTML:

```javascript
// atomList example
$('#comments').atomList(commentsAtom, {
  key: c => c.id,
  render: (comment) => {
    const safeBody = DOMPurify.sanitize(comment.body);
    return `<div class="comment">${safeBody}</div>`;
  }
});

// atomBind example
const safeContent = $.computed(() => DOMPurify.sanitize(rawHtml.value));
$('#card').atomBind({
  html: safeContent,
});
```

---

## Content Security Policy (CSP)

The library is designed to work with Content Security Policies. If your CSP forbids inline styles or scripts, ensure that DOMPurify is configured to strip these elements accordingly:

```javascript
const safeHtml = DOMPurify.sanitize(dirty, {
  FORBID_ATTR: ['style'],
  FORBID_TAGS: ['style'],
});
```

---

## Summary

| Scenario | Recommendation |
| -------- | -------------- |
| Static, developer-controlled HTML | The built-in `sanitizeHtml` utility may be used. |
| User-generated content (comments, profiles) | Use a dedicated library like DOMPurify. |
| Rich text editor output | Use DOMPurify with custom `ALLOWED_TAGS`. |
| Markdown rendering | Sanitize after the conversion to HTML. |
