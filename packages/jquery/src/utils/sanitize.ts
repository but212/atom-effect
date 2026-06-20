/**
 * @module AEJSanitizationEngine
 *
 * Responsibility:
 * Provides a high-performance, fragment-based HTML sanitization engine to
 * mitigate XSS and DOM Clobbering vulnerabilities.
 *
 * Design Intent:
 * Uses prototype-bound DOM methods and multi-pass normalization to neutralize
 * malicious payloads while preserving safe UI structures.
 *
 * Security:
 * The engine is designed for re-entrancy, using isolated template elements for
 * each cycle to prevent state corruption during recursive sanitization (e.g., srcdoc).
 */

import { SYSTEM_SECURITY } from '@/constants';

/**
 * Configuration for the HTML sanitization engine.
 *
 * When to use:
 * - Defining custom whitelists/blacklists for specific component requirements.
 * - Restricting URI-carrying attributes beyond the default set.
 */
export interface SanitizationPolicy {
  /** List of attribute names whose values should be validated as URIs. */
  readonly urlAttributes: string[];
  /** List of element local names that should be neutralized or stripped. */
  readonly blacklistedTags: string[];
}

/**
 * The standard sanitization policy used by the library.
 *
 * Logic: Strict Isolation
 * Targets executable elements (script, iframe), metadata (base, meta),
 * and layout-breaking tags (body, title).
 */
export const DEFAULT_POLICY: SanitizationPolicy = {
  urlAttributes: [
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
  ],
  blacklistedTags: [
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
    'isindex',
    'body',
  ],
};

/**
 * Map of safe replacements for common HTML entities.
 * @internal
 */
const ENTITIES: Record<string, string> = {
  colon: ':',
  tab: '\t',
  newline: '\n',
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

/** Values targeted for DOM Clobbering prevention. @internal */
const CLOBBER_ATTRS = new Set(['id', 'name']);
const CLOBBER_VALUES = new Set([
  'attributes',
  'tagname',
  'nodename',
  'innerhtml',
  'parentnode',
  'childnodes',
  'lastchild',
  'firstchild',
  'nextsibling',
  'previoussibling',
]);

/** SVG/SMIL attributes that can be used for XSS via animation. @internal */
const SENSITIVE_ATTRS = new Set(['attributename', 'from', 'to', 'values']);

const CONTROL_CHARS_PATTERN = '[\\x00-\\x1f\\x7f\\ufffd\\u0000]';

/**
 * Logic: Security Pattern Library
 * Consolidated regex patterns for neutralizing common XSS vectors,
 * control characters, and protocol obfuscation techniques.
 * @internal
 */
const REGEX = {
  /**
   * Security: Normalization
   * Captures numeric entities to normalize obfuscated character references.
   */
  NUMERIC_ENTITY: /&#x([0-9a-f]+);?|&#([0-9]+);?/gi,
  /**
   * Security: Normalization
   * Captures named HTML entities defined in ENTITIES to reveal hidden tags/protocols.
   */
  NAMED_ENTITY: new RegExp(`&(${Object.keys(ENTITIES).join('|')});?`, 'gi'),
  /**
   * Security: Filter Evasion
   * Captures control characters often used to break regex-based filters.
   */
  CONTROL_CHARS: new RegExp(CONTROL_CHARS_PATTERN, 'g'),
  /** Detects malicious data-URIs with active content types. */
  DATA_URI:
    /data\s*:\s*(?:text\/(?:html|javascript|vbscript|xml)|application\/(?:javascript|xhtml\+xml|xml|x-shockwave-flash)|image\/svg\+xml)/i,
  /** Detects dangerous protocols including obfuscated variations. */
  PROTOCOL: new RegExp(
    `(?:^|url\\s*\\(\\s*["']?)\\s*${SYSTEM_SECURITY.DANGEROUS_PROTOCOL_PATTERN}\\s*:`,
    'i'
  ),
  /** Strips CSS comments to prevent bypasses hidden within them. */
  CSS_CLEAN: /\/\*[\s\S]*?\*\//g,
} as const;

/**
 * @internal
 * Low-level DOM bridge using proto-bound methods to bypass potential DOM Clobbering.
 *
 * Security: Prototype Hardening
 * Uses Function.prototype.call to invoke methods directly from the prototype,
 * preventing attackers from shadowing these methods on the instance.
 */
const _call = Function.prototype.call.bind(Function.prototype.call);
const _get = (prototypeObject: object, propertyName: string) =>
  Object.getOwnPropertyDescriptor(prototypeObject, propertyName)?.get;

/**
 * Logic: Prototype-Bound Bridge
 * Provides deterministic access to native DOM methods, bypassing potential
 * instance-level shadowing (DOM Clobbering) for critical security operations.
 * @internal
 */
const DOM = {
  /** Retrieves all attributes from the prototype to ensure integrity. */
  getAttributes: (element: Element) => {
    const getter = _get(Element.prototype, 'attributes');
    const attrs = (getter ? _call(getter, element) : element.attributes) as NamedNodeMap;
    return Array.from(attrs, ({ name, value }) => ({ name, value }));
  },
  /** Sets an attribute bypassing instance-level shadowing. */
  setAttribute: (element: Element, key: string, value: string) =>
    _call(Element.prototype.setAttribute, element, key, value),
  /** Removes an attribute bypassing instance-level shadowing. */
  removeAttribute: (element: Element, key: string) =>
    _call(Element.prototype.removeAttribute, element, key),
  /** Replaces one node with another in the DOM tree. */
  replaceNode: (oldNode: Node, newNode: Node) => {
    if (oldNode.parentNode) {
      oldNode.parentNode.replaceChild(newNode, oldNode);
      return true;
    }
    return false;
  },
  /** Retrieves the lowercase local name reliably via the prototype. */
  getLocalName: (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    const getter = _get(Element.prototype, 'localName') ?? _get(Node.prototype, 'nodeName');
    return (getter ? (_call(getter, el) as string) : (el.localName ?? '')).toLowerCase();
  },
  /** Creates an HTMLElement in the current document context. */
  createElement: <T extends HTMLElement>(tag: string) => document.createElement(tag) as T,
};

/**
 * @internal
 * Logic: Multi-pass Normalization
 * Performs recursive decoding and filtering to expose hidden payloads.
 */
const Guard = {
  /** Resolves HTML entities to their literal characters. */
  decodeEntities(textToDecode: string): string {
    if (!textToDecode.includes('&')) return textToDecode;
    return textToDecode
      .replace(REGEX.NUMERIC_ENTITY, (_, hex, dec) => {
        const cp = hex ? parseInt(hex, 16) : parseInt(dec, 10);
        return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
      })
      .replace(REGEX.NAMED_ENTITY, (_, name) => ENTITIES[name.toLowerCase()] ?? '');
  },

  /**
   * Security: Normalization
   * Normalizes a string by decoding entities twice (to catch double-encoding)
   * and stripping non-printable/control characters.
   */
  normalize(value: string): string {
    if (typeof value !== 'string') return '';
    if (!value.includes('&') && !REGEX.CONTROL_CHARS.test(value)) return value;
    return this.decodeEntities(this.decodeEntities(value)).replace(REGEX.CONTROL_CHARS, '');
  },

  /** Validates if a URI contains dangerous protocols or data types. */
  isDangerousUri(value: string): boolean {
    if (!value.includes(':') && !value.includes('&')) return false;
    const normalizedUri = this.normalize(value).replace(/\s+/g, '');
    return REGEX.PROTOCOL.test(normalizedUri) || REGEX.DATA_URI.test(normalizedUri);
  },

  /**
   * Security: CSS Filtering
   * Detects script injection patterns in CSS declarations (e.g., expression, url(javascript)).
   */
  isDangerousCss(value: string): boolean {
    const clean = this.normalize(value).replace(REGEX.CSS_CLEAN, '').toLowerCase();
    if (['javascript:', 'expression(', '-moz-binding'].some((s) => clean.includes(s))) return true;
    const cssUrl = clean.match(/url\s*\(\s*["']?([^"')]*)["']?\s*\)/i)?.[1];
    return !!cssUrl && this.isDangerousUri(cssUrl);
  },
};

/**
 * @internal
 * Logic: Core Sanitization Engine
 * Implementation for recursive and fragment-based sanitization.
 *
 * Security: Re-entrancy
 * Does not use global singletons for parser/serializer to ensure that
 * recursive calls (e.g., for srcdoc) do not corrupt the state of
 * outer sanitization cycles.
 */
function _sanitize(html: string, policy: SanitizationPolicy): string {
  const parser = DOM.createElement<HTMLTemplateElement>('template');
  const serializer = document.createElement('div');

  parser.innerHTML = html;
  walkTree(parser.content, policy);

  serializer.innerHTML = '';
  serializer.appendChild(parser.content);
  return serializer.innerHTML;
}

/**
 * @internal
 * Logic: Special attribute handlers for style, srcdoc, and srcset.
 */
const SPECIAL_ATTRIBUTES: Record<
  string,
  (el: HTMLElement, name: string, value: string, policy: SanitizationPolicy) => void
> = {
  style(element, name, value) {
    const safeStyles = value
      .split(';')
      .map((p) => p.trim())
      .filter((p) => p && !Guard.isDangerousCss(p));
    DOM.setAttribute(
      element,
      name,
      safeStyles.length ? `${safeStyles.join('; ')};` : 'data-unsafe-css:'
    );
  },
  srcdoc(element, name, value, policy) {
    DOM.setAttribute(element, name, _sanitize(value, policy));
  },
  srcset(element, name, value) {
    const parts = value.split(',').map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return part;
      const [url, ...metadata] = trimmed.split(/\s+/);
      if (url === undefined) return part;
      return Guard.isDangerousUri(url)
        ? ['data-unsafe-protocol:', ...metadata].join(' ')
        : [Guard.normalize(url), ...metadata].join(' ');
    });
    DOM.setAttribute(element, name, parts.join(', '));
  },
};

/**
 * @internal
 * Predicates to identify dangerous attributes and values.
 */
const isClobbered = (key: string, lowerCaseValue: string) =>
  CLOBBER_ATTRS.has(key) && CLOBBER_VALUES.has(lowerCaseValue);

const isSensitiveSvg = (key: string, attributeValue: string) =>
  SENSITIVE_ATTRS.has(key) &&
  (attributeValue.startsWith('on') || Guard.isDangerousUri(attributeValue));

const isDangerousContent = (key: string, val: string, lowerCaseValue: string) =>
  key.includes('javascript') ||
  key.includes('expression') ||
  lowerCaseValue.includes('javascript') ||
  lowerCaseValue.includes('expression') ||
  Guard.isDangerousUri(val);

/**
 * @internal
 * Logic: Attribute Scrubbing
 * Iterates through all attributes of an element and applies defense rules.
 */
function scrubElement(elementToScrub: HTMLElement, policy: SanitizationPolicy): void {
  const attrs = DOM.getAttributes(elementToScrub);
  let detectedEvents: string[] | null = null;

  for (const { name, value } of attrs) {
    const key = name.toLowerCase();
    const lowerCaseValue = value.toLowerCase();

    // 1. Event Handlers
    if (key.startsWith('on')) {
      if (!detectedEvents) detectedEvents = [];
      detectedEvents.push(name);
      DOM.removeAttribute(elementToScrub, name);
      continue;
    }

    // 2. Special attributes (style, srcdoc, srcset)
    const specialHandler = SPECIAL_ATTRIBUTES[key];
    if (specialHandler) {
      specialHandler(elementToScrub, name, value, policy);
      continue;
    }

    // 3. Registered URL attributes
    if (policy.urlAttributes.includes(key)) {
      if (Guard.isDangerousUri(value)) {
        DOM.setAttribute(elementToScrub, name, 'data-unsafe-protocol:');
      }
      continue;
    }

    // 4. Security Blocks (DOM Clobbering, SVG Injection, & general dangerous patterns)
    if (
      isClobbered(key, lowerCaseValue) ||
      isSensitiveSvg(key, value) ||
      isDangerousContent(key, value, lowerCaseValue)
    ) {
      DOM.removeAttribute(elementToScrub, name);
    }
  }

  if (detectedEvents?.length) {
    DOM.setAttribute(elementToScrub, 'data-unsafe-attr', detectedEvents.join(','));
  }
}

/**
 * @internal
 * Logic: Node Processing
 * Analyzes and transforms a node into its safe representation.
 */
function processNode(node: Node, policy: SanitizationPolicy): Node {
  // 1. Logic: Text Node Sanitization
  // Detects and neutralizes encoded tags hidden within text content to prevent bypasses.
  if (node.nodeType === Node.TEXT_NODE) {
    const content = node.textContent ?? '';
    if (
      policy.blacklistedTags.some((tag) =>
        Guard.normalize(content).toLowerCase().includes(`<${tag}`)
      )
    ) {
      const span = DOM.createElement('span');
      /**
       * Logic: Structural Neutralization
       * Replaces tag delimiters (<, >) with safe brackets ([, ]).
       * This approach ensures the content remains inert across all parsing contexts
       * without relying on complex HTML entity encoding/decoding cycles,
       * which are subject to browser-specific interpretation quirks.
       */
      span.textContent = content.replace(/</g, '[').replace(/>/g, ']');
      return DOM.replaceNode(node, span) ? span : node;
    }
    return node;
  }

  // 2. Logic: Element Processing
  if (node.nodeType !== Node.ELEMENT_NODE) return node;
  const element = node as HTMLElement;
  const tag = DOM.getLocalName(element);

  scrubElement(element, policy);

  // 3. Logic: Blacklist Neutralization
  // Replaces forbidden elements with <span> while preserving attributes and children.
  if (policy.blacklistedTags.includes(tag)) {
    const span = DOM.createElement('span');
    // Simplified attribute mirroring.
    for (const attribute of DOM.getAttributes(element)) {
      span.setAttribute(attribute.name, attribute.value);
    }
    scrubElement(span, policy);

    // Security: Recursive Style Protection
    if (tag === 'style' && Guard.isDangerousCss(element.textContent ?? '')) {
      span.textContent = '/* blocked */';
    } else {
      while (element.firstChild) span.appendChild(element.firstChild);
    }

    return DOM.replaceNode(element, span) ? span : element;
  }

  return element;
}

/**
 * @internal
 * Logic: DOM Tree Traversal using native TreeWalker.
 */
function walkTree(root: Node, policy: SanitizationPolicy): void {
  // Use native TreeWalker for efficient, non-recursive traversal.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);

  let node: Node | null = root;
  while (node) {
    const nextNode = walker.nextNode();
    processNode(node, policy);

    // Template content must be handled separately as they are inert fragments.
    if (node.nodeType === Node.ELEMENT_NODE && DOM.getLocalName(node) === 'template') {
      walkTree((node as HTMLTemplateElement).content, policy);
    }
    node = nextNode;
  }
}

/**
 * @internal
 * Optimization: Bounded cache for sanitized HTML strings using a FIFO eviction policy.
 */
class FIFOCache<K, V> extends Map<K, V> {
  readonly #limit: number;

  constructor(limit = 1000) {
    super();
    this.#limit = limit;
  }

  override set(key: K, value: V): this {
    if (this.size >= this.#limit && !this.has(key)) {
      const firstKey = this.keys().next().value;
      if (firstKey !== undefined) {
        this.delete(firstKey);
      }
    }
    return super.set(key, value);
  }
}

export const sanitizeCache = new FIFOCache<string, string>();

/**
 * Sanitizes an HTML string based on a security policy.
 *
 * When to use:
 * - Mandatory before injecting untrusted content via `atomHtml` or jQuery's `html()`.
 * - Establishing a security boundary between reactive state and the DOM.
 *
 * Caution:
 * Sanitization is performed in the context of a detached `<template>`,
 * ensuring that active scripts are never executed during the process.
 *
 * @param html - The raw HTML string to be sanitized.
 * @param policy - The policy defining safe/unsafe elements. Defaults to `DEFAULT_POLICY`.
 *
 * @returns A safe HTML string with dangerous elements neutralized and attributes scrubbed.
 *
 * @example
 * const safeHtml = sanitizeHtml('<img src=x onerror=alert(1)>');
 * // Returns: '<img src="x" data-unsafe-attr="onerror">'
 */
export function sanitizeHtml(
  html: string | null | undefined,
  policy: SanitizationPolicy = DEFAULT_POLICY
): string {
  if (!html) return '';
  const rawHtml = String(html);
  if (policy !== DEFAULT_POLICY) return _sanitize(rawHtml, policy);

  let sanitized = sanitizeCache.get(rawHtml);
  if (sanitized === undefined) {
    sanitized = _sanitize(rawHtml, policy);
    sanitizeCache.set(rawHtml, sanitized);
  }
  return sanitized;
}

/**
 * Validates if a specific attribute/value pair is considered dangerous.
 *
 * When to use:
 * - Performing ad-hoc validation on individual attributes (e.g., in a custom `attr` binding).
 * - Early rejection of malicious URIs before they reach the DOM.
 */
export const isDangerousUrl = (
  attr: string,
  urlValue: string,
  policy: SanitizationPolicy = DEFAULT_POLICY
): boolean => {
  const key = attr.toLowerCase();
  return (key === 'srcdoc' || policy.urlAttributes.includes(key)) && Guard.isDangerousUri(urlValue);
};

/**
 * Validates if a CSS value contains dangerous patterns.
 *
 * @param cssValue The CSS property value to check.
 * @returns True if dangerous patterns (e.g., expression, javascript) are detected.
 */
export const isDangerousCssValue = (cssValue: unknown): boolean =>
  typeof cssValue === 'string' ? Guard.isDangerousCss(cssValue) : false;
