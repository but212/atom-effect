import { DANGEROUS_PROTOCOL_PATTERN } from '@/constants';

// --- Configuration & Security Constants ---

/** Attributes that must be checked for dangerous URI protocols. */
const URL_ATTRIBUTES = [
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
];

/** Tags that are dangerous and must be neutralized by transforming them into safe containers. */
const BLACKLISTED_TAGS = [
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
];

/** List of patterns that are forbidden within CSS contexts. */
const CSS_DANGER_PATTERNS = [
  /expression\s*\(/i, // IE legacy expressions
  /behavior\s*:/i, // IE legacy behaviors
  /-moz-binding\s*:/i, // Old Firefox XBL bindings
  /@import/i, // External stylesheet imports
  new RegExp(`url\\s*\\(\\s*["']?\\s*${DANGEROUS_PROTOCOL_PATTERN}\\s*:`, 'i'), // url(javascript:...)
  /data\s*:\s*(?!image\/)/i, // data: URIs that aren't images
];

/** Mapping of obfuscated HTML entities to their plain-text equivalents. */
const HTML_ENTITY_LOOKUP: Record<string, string> = {
  colon: ':',
  tab: '\t',
  newline: '\n',
};

// --- Regex Definitions ---

const REGEX_NUMERIC_ENTITY = /&#x([0-9a-f]+);?|&#([0-9]+);?/gi;
const REGEX_NAMED_ENTITY = /&(colon|tab|newline);?/gi;

// biome-ignore lint/suspicious/noControlCharactersInRegex: necessary for protocol normalization
const REGEX_CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

const REGEX_DATA_URI_HTML =
  /data\s*:\s*(?:text\/(?:html|javascript|vbscript|xml)|application\/(?:javascript|xhtml\+xml|xml|x-shockwave-flash)|image\/svg\+xml)/i;

/** Optimization: Pre-compiled strict protocol pattern */
const REGEX_PROTOCOL_STRICT = new RegExp(
  `(?:^|url\\s*\\(\\s*["']?)\\s*${DANGEROUS_PROTOCOL_PATTERN}\\s*:`,
  'i'
);

/**
 * Logic: A combined pattern used for fast-path sniffing of dangerous content.
 * Synchronized automatically with BLACKLISTED_TAGS.
 */
const REGEX_DANGEROUS_SNIFFER = new RegExp(
  [
    `(<(${BLACKLISTED_TAGS.join('|')})\\b[^>]*>([\\s\\S]*?)<\\/\\2>|<(${BLACKLISTED_TAGS.join('|')})\\b[^>]*\\/?>)`,
    '\\bon\\w+\\s*=',
    `${DANGEROUS_PROTOCOL_PATTERN}\\s*:`,
    REGEX_DATA_URI_HTML.source,
  ].join('|'),
  'i'
);

// --- Safe DOM Access ---

/**
 * Security: DOM Clobbering Prevention
 * Accesses DOM properties via `Element.prototype` to prevent bypass attacks
 * that use `Object.defineProperty` on element instances (DOM Clobbering).
 * This ensures the sanitizer always uses the browser's intended methods
 * even if the global environment has been tampered with.
 *
 * @internal
 */
const DOM_PROTOTYPE_BRIDGE = {
  getAttributes: (element: Element) =>
    Object.getOwnPropertyDescriptor(Element.prototype, 'attributes')!.get!.call(
      element
    ) as NamedNodeMap,
  setAttribute: (element: Element, name: string, value: string) =>
    Element.prototype.setAttribute.call(element, name, value),
  removeAttribute: (element: Element, name: string) =>
    Element.prototype.removeAttribute.call(element, name),
  replaceElement: (oldElement: Element, newElement: Node) =>
    Element.prototype.replaceWith.call(oldElement, newElement),
  getLocalName: (element: Element) =>
    Object.getOwnPropertyDescriptor(Element.prototype, 'localName')!.get!.call(element) as string,
  getFirstChild: (node: Node) =>
    Object.getOwnPropertyDescriptor(Node.prototype, 'firstChild')!.get!.call(
      node
    ) as ChildNode | null,
};

// --- Normalization & Validation Logic ---

/**
 * Logic: Entity Normalization
 * Decodes HTML entities and strips control characters to reveal protocols
 * that might be hidden via obfuscation (e.g., `j&#x61;vascript:`).
 *
 * @internal
 */
function normalizeValue(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(REGEX_NUMERIC_ENTITY, (_, hex, dec) => {
      const codePoint = hex ? parseInt(hex, 16) : parseInt(dec, 10);
      return codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '';
    })
    .replace(REGEX_NAMED_ENTITY, (_, name) => HTML_ENTITY_LOOKUP[name.toLowerCase()] ?? '')
    .replace(REGEX_CONTROL_CHARS, '');
}

/**
 * Returns true if the string contains a dangerous URI protocol.
 */
function isDangerousProtocol(value: string): boolean {
  const cleanedValue = value.replace(/\s+/g, '');
  return REGEX_PROTOCOL_STRICT.test(cleanedValue) || REGEX_DATA_URI_HTML.test(cleanedValue);
}

/**
 * Caution: Protocol Smuggling
 * The `srcset` attribute can contain multiple, comma-separated URLs.
 * Each segment must be parsed and sanitized individually to prevent malicious
 * protocols from being injected between safe sources.
 *
 * @internal
 */
function scrubSrcset(value: string): string {
  return value
    .split(',')
    .map((part) => {
      const trimmedPart = part.trim();
      if (!trimmedPart) return part;
      const [url, ...metadata] = trimmedPart.split(/\s+/);
      const normalizedUrl = normalizeValue(url!);
      return isDangerousProtocol(normalizedUrl)
        ? ['data-unsafe-protocol:', ...metadata].join(' ')
        : [normalizedUrl, ...metadata].join(' ');
    })
    .join(',');
}

/**
 * Normalizes CSS by removing comments and extra whitespace
 * to reveal hidden keywords or protocols.
 */
function normalizeCss(value: string): string {
  const normalized = normalizeValue(value);
  // Strip CSS comments: /* ... */
  return normalized.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Returns true if any dangerous CSS patterns are detected. */
function isCssDangerous(value: string): boolean {
  const cleanCss = normalizeCss(value);
  return CSS_DANGER_PATTERNS.some((pattern) => pattern.test(cleanCss));
}

// --- Attribute Specific Scrubbers ---

/**
 * Logic: Handlers for attributes that require specialized sanitization logic.
 */
const ATTRIBUTE_HANDLERS: Record<
  string,
  (element: HTMLElement, name: string, value: string) => void
> = {
  srcdoc: (element, name, value) => {
    const normalizedValue = normalizeValue(value);
    DOM_PROTOTYPE_BRIDGE.setAttribute(element, name, sanitizeHtml(normalizedValue));
  },
  srcset: (element, name, value) => {
    DOM_PROTOTYPE_BRIDGE.setAttribute(element, name, scrubSrcset(value));
  },
  style: (element, _, value) => {
    if (isCssDangerous(value)) {
      DOM_PROTOTYPE_BRIDGE.setAttribute(element, 'style', 'data-unsafe-css:');
    }
  },
};

// --- Scrubber Core ---

/**
 * Scrubs event listeners (on*) and malicious protocols from individual element attributes.
 */
function applySecurityPolicy(element: HTMLElement): void {
  const attributes = DOM_PROTOTYPE_BRIDGE.getAttributes(element);
  if (!attributes) return;

  const scrubbedEventHandlers: string[] = [];

  for (let i = attributes.length - 1; i >= 0; i--) {
    const attribute = attributes[i]!;
    const name = attribute.name;
    const lowerName = name.toLowerCase();
    const value = attribute.value;

    if (lowerName.startsWith('on')) {
      DOM_PROTOTYPE_BRIDGE.removeAttribute(element, name);
      scrubbedEventHandlers.push(name);
      continue;
    }

    if (ATTRIBUTE_HANDLERS[lowerName]) {
      ATTRIBUTE_HANDLERS[lowerName]!(element, name, value);
    } else if (URL_ATTRIBUTES.includes(lowerName)) {
      const normalizedValue = normalizeValue(value);
      if (isDangerousProtocol(normalizedValue)) {
        DOM_PROTOTYPE_BRIDGE.setAttribute(element, name, 'data-unsafe-protocol:');
      }
    }
  }

  if (scrubbedEventHandlers.length > 0) {
    DOM_PROTOTYPE_BRIDGE.setAttribute(element, 'data-unsafe-attr', scrubbedEventHandlers.join(','));
  }
}

/**
 * Logic: Node Transformation
 * Neutralizes dangerous tags (like `<script>`) by converting them safely
 * into `<span>` containers while preserving non-executable children.
 *
 * @internal
 */
function neutralizeDangerousNode(element: HTMLElement): void {
  if (!BLACKLISTED_TAGS.includes(DOM_PROTOTYPE_BRIDGE.getLocalName(element))) return;

  const safeReplacement = document.createElement('span');
  const attributes = DOM_PROTOTYPE_BRIDGE.getAttributes(element);

  for (let i = 0; i < attributes.length; i++) {
    const attr = attributes[i];
    if (attr) safeReplacement.setAttribute(attr.name, attr.value);
  }

  // Scrub attributes copied from dangerous nodes
  applySecurityPolicy(safeReplacement);

  let child = DOM_PROTOTYPE_BRIDGE.getFirstChild(element);
  while (child) {
    safeReplacement.appendChild(child);
    child = DOM_PROTOTYPE_BRIDGE.getFirstChild(element);
  }

  DOM_PROTOTYPE_BRIDGE.replaceElement(element, safeReplacement);
}

/**
 * Recursive walker that processes a document fragment and its nested templates.
 */
function executeSanitizationWalk(root: Node | DocumentFragment): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const processingQueue: HTMLElement[] = [];

  let currentElement = walker.nextNode() as HTMLElement | null;
  while (currentElement) {
    processingQueue.push(currentElement);
    if (DOM_PROTOTYPE_BRIDGE.getLocalName(currentElement) === 'template') {
      executeSanitizationWalk((currentElement as HTMLTemplateElement).content);
    }
    currentElement = walker.nextNode() as HTMLElement | null;
  }

  for (const node of processingQueue) {
    applySecurityPolicy(node);
    neutralizeDangerousNode(node);
  }
}

// --- Public APIs ---

/**
 * Sanitizes a raw HTML string by stripping dangerous tags, attributes, and protocols.
 *
 * When to use:
 * - Before injecting untrusted HTML strings into the DOM via `$.fn.atomHtml`.
 * - Processing user-provided markup to prevent Cross-Site Scripting (XSS).
 *
 * Logic: Template Isolation
 * Uses a detached `<template>` element to parse and walk the DOM tree
 * without executing any malicious payloads during the scrubbing process.
 *
 * @param html - The raw HTML string to cleanse.
 * @returns A sanitized HTML string safe for browser execution.
 *
 * @example
 * ```typescript
 * const dirty = '<img src=x onerror=alert(1)>';
 * const clean = sanitizeHtml(dirty);
 * // Result: <img src="x" data-unsafe-attr="onerror">
 * ```
 *
 * @public
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';
  // Use a fresh template per call to avoid complex state management.
  const template = document.createElement('template');
  template.innerHTML = String(html);
  executeSanitizationWalk(template.content);
  return template.innerHTML;
}

/**
 * Checks if a specific attribute/value pair contains dangerous content.
 *
 * When to use:
 * - To validate individual attribute updates in `$.fn.atomAttr`.
 * - Preventing protocol smuggling in property-level bindings.
 *
 * @param attribute - The name of the HTML attribute (e.g., 'href').
 * @param value - The material to validate.
 * @returns True if the value contains a dangerous protocol or script context.
 *
 * @example
 * ```typescript
 * isDangerousUrl('href', 'javascript:alert(1)'); // true
 * isDangerousUrl('src', 'https://safe.com/img.png'); // false
 * ```
 *
 * @public
 */
export const isDangerousUrl = (attribute: string, value: string): boolean => {
  const lowerAttribute = attribute.toLowerCase();
  if (!URL_ATTRIBUTES.includes(lowerAttribute)) return false;

  const normalizedValue = normalizeValue(value);
  return lowerAttribute === 'srcdoc'
    ? REGEX_DANGEROUS_SNIFFER.test(normalizedValue)
    : isDangerousProtocol(normalizedValue);
};

/**
 * Checks if a CSS value contains dangerous expressions or forbidden protocols.
 *
 * When to use:
 * - To validate dynamic style updates in `$.fn.atomCss`.
 *
 * Logic: Pattern Matching
 * Detects legacy IE `expression()` behaviors and modern obfuscated URI
 * protocols hidden within CSS comments or entities.
 *
 * @param value - The CSS property value to validate.
 * @returns True if the value contains patterns like `expression()` or `url(javascript:...)`.
 *
 * @example
 * ```typescript
 * isDangerousCssValue('url(javascript:alert(1))'); // true
 * isDangerousCssValue('red'); // false
 * ```
 *
 * @public
 */
export const isDangerousCssValue = (value: string): boolean => {
  const cleanCss = normalizeValue(value).replace(/\/\*[\s\S]*?\*\//g, '');
  return CSS_DANGER_PATTERNS.some((pattern) => pattern.test(cleanCss));
};
