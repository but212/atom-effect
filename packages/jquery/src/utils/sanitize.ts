/**
 * HTML sanitization and security guards for XSS mitigation.
 *
 * This module provides a multi-layered defense:
 * 1. Fast-path scanner for O(n) safety checks.
 * 2. Hardened normalization (Entity decoding, Control character removal).
 * 3. Recursive tag stripping.
 * 4. Protocol and CSS neutralizers.
 */
import { DANGEROUS_PROTOCOL_PATTERN } from '@/constants';

// ============================================================================
// Constants & Configuration
// ============================================================================

/** Attributes that carry a URL or raw HTML (srcdoc). */
export const URL_ATTRS = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'xlink:href',
  'data',
  'poster',
  'background',
  'cite',
  'longdesc',
  'profile',
  'usemap',
  'classid',
  'codebase',
  'fill',
  'filter',
  'mask',
  'marker-start',
  'marker-mid',
  'marker-end',
  'clip-path',
  'srcdoc',
  'srcset',
]);

const DANGEROUS_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'base',
  'meta',
  'applet',
  'noscript',
  'form',
  'style',
  'link',
  'title',
]);

const NAMED_ENTITY_MAP: Record<string, string> = {
  colon: ':',
  tab: '\t',
  newline: '\n',
};

// ============================================================================
// Regex Engine (Pre-compiled for performance)
// ============================================================================

const RE_NUMERIC_ENTITY = /&#x([0-9a-f]+);?|&#([0-9]+);?/gi;
const RE_NAMED_ENTITY = /&(colon|tab|newline);?/gi;
// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters for XSS sanitization
const RE_STRIP_CTRL = /[\x00-\x1f\x7f]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters for XSS sanitization
const RE_FAST_SCAN = /[<&\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

const RE_DANGEROUS_TAG =
  /(<(script|iframe|object|embed|base|meta|applet|noscript|form|style|link)\b[^>]*>([\s\S]*?)<\/\2>|<(script|iframe|object|embed|base|meta|applet|noscript|form|style|link)\b[^>]*\/?>)/gi;
const RE_UNSAFE_ATTR = /\bon\w+\s*=/gim;

const PROTOCOL_PATTERN = `${DANGEROUS_PROTOCOL_PATTERN}\\s*:`;
const RE_DANGEROUS_PROTOCOL_GLOBAL = new RegExp(PROTOCOL_PATTERN, 'gi');
const RE_DANGEROUS_PROTOCOL_CONTEXT = new RegExp(
  `(?:^|url\\s*\\(\\s*["']?)\\s*${PROTOCOL_PATTERN}`,
  'i'
);

const RE_DANGEROUS_DATA_URI =
  /data\s*:\s*(?:text\/(?:html|javascript|vbscript|xml)|application\/(?:javascript|xhtml\+xml|xml|x-shockwave-flash)|image\/svg\+xml)/gi;

/** CSS Sanitization: Optimized to avoid over-matching standard HTML attributes */
const CSS_KEYWORD_PATTERN = `(?:expression\\s*\\(|behavior\\s*:|-moz-binding\\s*:|url\\s*\\(\\s*["']?\\s*${PROTOCOL_PATTERN}(?!image\\/)|data\\s*:\\s*(?!image\\/))`;
const RE_DANGEROUS_CSS_SINGLE = new RegExp(CSS_KEYWORD_PATTERN, 'im');

// ============================================================================
// Internal Helpers
// ============================================================================

/** Normalizes a string by decoding entities and stripping control characters. */
function normalize(s: string): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(RE_NUMERIC_ENTITY, (_, hex, dec) => {
      const cp = hex ? parseInt(hex, 16) : parseInt(dec, 10);
      return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    })
    .replace(RE_NAMED_ENTITY, (_, name) => NAMED_ENTITY_MAP[name.toLowerCase()] ?? '')
    .replace(RE_STRIP_CTRL, '');
}

/** Returns true if the string contains a dangerous protocol or data URI. */
function hasDangerousProtocol(s: string): boolean {
  return RE_DANGEROUS_PROTOCOL_CONTEXT.test(s) || RE_DANGEROUS_DATA_URI.test(s);
}

/** Checks for high-risk HTML content (tags, on* handlers, embedded protocols). */
function isDangerousHtmlContent(s: string): boolean {
  return RE_DANGEROUS_TAG.test(s) || RE_UNSAFE_ATTR.test(s) || RE_DANGEROUS_PROTOCOL_GLOBAL.test(s);
}

/** O(n) scan to skip sanitization for safe strings. */
function needsSanitization(s: string): boolean {
  if (RE_FAST_SCAN.test(s) || s.includes(':')) return true;

  const lower = s.toLowerCase();
  let onIdx = lower.indexOf('on');
  while (onIdx !== -1 && onIdx < s.length - 2) {
    const nextChar = lower.charCodeAt(onIdx + 2);
    if (nextChar >= 97 && nextChar <= 122) return true; // a-z
    onIdx = lower.indexOf('on', onIdx + 1);
  }
  return false;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Inert template for parsing.
 */
const SHARED_TEMPLATE = document.createElement('template');

/**
 * DOM_BRIDGE: Low-level access to Element prototypes.
 * Bypasses DOM Clobbering by avoiding direct property access on potentially shadowed elements.
 */
const DOM_BRIDGE = {
  getAttributes: (el: Element) =>
    Object.getOwnPropertyDescriptor(Element.prototype, 'attributes')!.get!.call(el) as NamedNodeMap,
  removeAttribute: (el: Element, name: string) => Element.prototype.removeAttribute.call(el, name),
  replaceWith: (oldEl: Element, newEl: Node) => Element.prototype.replaceWith.call(oldEl, newEl),
};

/**
 * Scrubs a single element for dangerous tags and attributes.
 */
function scrubElement(el: HTMLElement): void {
  const nodeName = el.localName;

  // 1. Sanitize Attributes FIRST (Always sanitize before potential tag replacement)
  const attrs = DOM_BRIDGE.getAttributes(el);
  if (attrs && attrs.length > 0) {
    for (let i = attrs.length - 1; i >= 0; i--) {
      const attr = attrs[i];
      if (!attr) continue;

      const name = attr.name;
      const lowerName = name.toLowerCase();
      const value = attr.value;

      if (lowerName.startsWith('on')) {
        DOM_BRIDGE.removeAttribute(el, name);
        el.setAttribute('data-unsafe-attr', name);
      } else if (URL_ATTRS.has(lowerName)) {
        const normalized = normalize(value);
        const isBlocked =
          lowerName === 'srcdoc'
            ? isDangerousHtmlContent(normalized)
            : hasDangerousProtocol(normalized);

        if (isBlocked) {
          el.setAttribute(name, 'data-unsafe-protocol:');
        }
      } else if (lowerName === 'style') {
        if (isDangerousCssValue(value)) {
          el.setAttribute('style', 'data-unsafe-css:');
        }
      }
    }
  }

  // 2. Replace Dangerous Tags with inert <span>
  if (DANGEROUS_TAGS.has(nodeName)) {
    const span = document.createElement('span');
    const sanitizedAttrs = DOM_BRIDGE.getAttributes(el);

    // Transfer attributes
    for (let i = 0; i < sanitizedAttrs.length; i++) {
      const a = sanitizedAttrs[i];
      if (a) span.setAttribute(a.name, a.value);
    }

    // Transfer children
    while (el.firstChild) {
      span.appendChild(el.firstChild);
    }

    DOM_BRIDGE.replaceWith(el, span);
  }
}

/**
 * Exhaustive Tree Traversal.
 * Correctly handles <template> shadowing by descending into .content.
 */
function walkAndScrub(root: Node | DocumentFragment): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let el = walker.nextNode() as HTMLElement | null;

  // We use a manual loop because replacing nodes during TreeWalker iteration can be tricky.
  // Collecting elements to transform is safer and still high-performance.
  const toScrub: HTMLElement[] = [];
  while (el) {
    toScrub.push(el);
    if (el.localName === 'template') {
      walkAndScrub((el as HTMLTemplateElement).content);
    }
    el = walker.nextNode() as HTMLElement | null;
  }

  for (let i = 0; i < toScrub.length; i++) {
    scrubElement(toScrub[i]!);
  }
}

/**
 * HTML sanitization for XSS mitigation using inert fragments.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';
  const sInit = String(html);

  if (!needsSanitization(sInit)) return sInit;

  SHARED_TEMPLATE.innerHTML = sInit;
  const frag = SHARED_TEMPLATE.content;

  walkAndScrub(frag);

  const result = SHARED_TEMPLATE.innerHTML;
  SHARED_TEMPLATE.innerHTML = ''; // Eager GC

  return result;
}

/** Checks for dangerous patterns in URL-bearing attributes or HTML sinks. */
export const isDangerousUrl = (attr: string, val: string): boolean => {
  const lowerAttr = attr.toLowerCase();
  if (!URL_ATTRS.has(lowerAttr)) return false;

  const normalized = normalize(val);

  if (lowerAttr === 'srcdoc') {
    return isDangerousHtmlContent(normalized);
  }

  return hasDangerousProtocol(normalized);
};

/** Checks for protocols/expressions inside CSS. */
export const isDangerousCssValue = (val: string): boolean => {
  return RE_DANGEROUS_CSS_SINGLE.test(normalize(val));
};
