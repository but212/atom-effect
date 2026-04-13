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
const RE_STRIP_CTRL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters for XSS sanitization
const RE_FAST_SCAN = /[<&\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

const RE_STRIP_XML = /<\?[\s\S]*?\?>/g;
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
const RE_DANGEROUS_CSS_GLOBAL = new RegExp(CSS_KEYWORD_PATTERN, 'gim');
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
  // Use sequential tests for short-circuiting; individual tests are often faster than one giant regex
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
 * HTML sanitization for XSS mitigation.
 * Optimized with an early-exit fast-path.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';
  const sInit = String(html);

  if (!needsSanitization(sInit)) return sInit;

  let s = normalize(sInit);

  // 1. Tag Stripping (Recursive)
  if (s.includes('<')) {
    s = s.replace(RE_STRIP_XML, '');
    let prev: string;
    do {
      prev = s;
      s = s.replace(RE_DANGEROUS_TAG, '');
    } while (s !== prev);
  }

  // 2. Neutralization (Multi-pass but deterministic)
  return s
    .replace(RE_DANGEROUS_CSS_GLOBAL, 'data-unsafe-css:')
    .replace(RE_DANGEROUS_PROTOCOL_GLOBAL, 'data-unsafe-protocol:')
    .replace(RE_DANGEROUS_DATA_URI, 'data-unsafe-protocol:')
    .replace(RE_UNSAFE_ATTR, 'data-unsafe-attr=');
}

/** Checks for dangerous patterns in URL-bearing attributes or HTML sinks. */
export const isDangerousUrl = (attr: string, val: string): boolean => {
  const lowerAttr = attr.toLowerCase();
  if (!URL_ATTRS.has(lowerAttr)) return false;

  const normalized = normalize(val);

  // srcdoc is effectively an innerHTML sink for iframes
  if (lowerAttr === 'srcdoc') {
    return isDangerousHtmlContent(normalized);
  }

  return hasDangerousProtocol(normalized);
};

/** Checks for protocols/expressions inside CSS. */
export const isDangerousCssValue = (val: string): boolean => {
  return RE_DANGEROUS_CSS_SINGLE.test(normalize(val));
};
