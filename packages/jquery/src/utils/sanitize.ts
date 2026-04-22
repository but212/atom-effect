import { DANGEROUS_PROTOCOL_PATTERN } from '@/constants';

// --- Configuration & Security Policy ---

/**
 * Security Policy: Defines the boundaries of what is considered dangerous.
 * Separation of Policy (Data) from Execution (Logic).
 *
 * When to use:
 * - When creating a custom sanitization sandbox for specific security requirements.
 * - To override default blacklisted tags or allowed URL attributes.
 *
 * @public
 */
export interface SanitizationPolicy {
  /** Attributes that must be checked for dangerous URI protocols. */
  readonly urlAttributes: string[];
  /** Tags that are neutralized by transforming them into safe containers (e.g., <span>). */
  readonly blacklistedTags: string[];
  /** Patterns forbidden within CSS contexts. */
  readonly cssDangerPatterns: RegExp[];
}

/**
 * Default Sanitization Policy.
 * Following Rob Pike's Rule 5: "Data dominates."
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
    'srcdoc',
    'srcset',
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
  ],
  cssDangerPatterns: [
    /expression\s*\(/i, // IE legacy expressions
    /behavior\s*:/i, // IE legacy behaviors
    /-moz-binding\s*:/i, // Old Firefox XBL bindings
    /@import/i, // External stylesheet imports
    new RegExp(`url\\s*\\(\\s*["']?\\s*${DANGEROUS_PROTOCOL_PATTERN}\\s*:`, 'i'), // url(javascript:...)
    /data\s*:\s*(?!image\/)/i, // data: URIs that aren't images
  ],
};

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

// --- Safe DOM Access ---

/**
 * Security: DOM Clobbering Prevention
 *
 * Reason: Accesses DOM properties via `Element.prototype` to prevent bypass attacks
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
 * Normalizes a string by decoding entities and removing control characters.
 *
 * Logic: Decodes HTML entities (numeric and named) and strips control characters
 * to reveal protocols that might be hidden via obfuscation (e.g., `j&#x61;vascript:`).
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

/** @internal */
function isDangerousProtocol(value: string): boolean {
  const cleanedValue = value.replace(/\s+/g, '');
  return REGEX_PROTOCOL_STRICT.test(cleanedValue) || REGEX_DATA_URI_HTML.test(cleanedValue);
}

/**
 * Detects if a string contains dangerous HTML structures.
 *
 * Reason: Following Rob Pike's Rule 4 ("Simple is better"), we use explicit,
 * readable checks instead of a single, complex regular expression. This reduces
 * false positives and makes maintenance easier as new vectors are discovered.
 *
 * @internal
 */
function containsDangerousHtml(value: string, policy: SanitizationPolicy): boolean {
  const normalized = normalizeValue(value);
  const lowerValue = normalized.toLowerCase();

  // 1. Check for blacklisted tags
  if (policy.blacklistedTags.some((tag) => lowerValue.includes(`<${tag}`))) {
    return true;
  }

  // 2. Check for event handlers
  if (/\bon\w+\s*=/i.test(normalized)) {
    return true;
  }

  // 3. Check for dangerous protocols
  if (isDangerousProtocol(normalized)) {
    return true;
  }

  return false;
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

/** @internal */
function normalizeCss(value: string): string {
  const normalized = normalizeValue(value);
  // Strip CSS comments: /* ... */
  return normalized.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** @internal */
function isCssDangerous(value: string, policy: SanitizationPolicy): boolean {
  const cleanCss = normalizeCss(value);
  return policy.cssDangerPatterns.some((pattern) => pattern.test(cleanCss));
}

// --- Attribute Specific Scrubbers ---

/**
 * Logic: Specialized handlers for attributes requiring complex sanitization.
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
    if (isCssDangerous(value, DEFAULT_POLICY)) {
      DOM_PROTOTYPE_BRIDGE.setAttribute(element, 'style', 'data-unsafe-css:');
    }
  },
};

// --- Scrubber Core ---

/** @internal */
function applySecurityPolicy(element: HTMLElement, policy: SanitizationPolicy): void {
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
    } else if (policy.urlAttributes.includes(lowerName)) {
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
 * Neutralizes dangerous tags by converting them safely into safe containers.
 *
 * Logic: Converts tags like `<script>` or `<iframe>` into `<span>` elements
 * while preserving their non-executable children and scrubbing their attributes.
 *
 * @internal
 */
function neutralizeDangerousNode(element: HTMLElement, policy: SanitizationPolicy): void {
  if (!policy.blacklistedTags.includes(DOM_PROTOTYPE_BRIDGE.getLocalName(element))) return;

  const safeReplacement = document.createElement('span');
  const attributes = DOM_PROTOTYPE_BRIDGE.getAttributes(element);

  for (let i = 0; i < attributes.length; i++) {
    const attr = attributes[i];
    if (attr) safeReplacement.setAttribute(attr.name, attr.value);
  }

  // Scrub attributes copied from dangerous nodes
  applySecurityPolicy(safeReplacement, policy);

  let child = DOM_PROTOTYPE_BRIDGE.getFirstChild(element);
  while (child) {
    safeReplacement.appendChild(child);
    child = DOM_PROTOTYPE_BRIDGE.getFirstChild(element);
  }

  DOM_PROTOTYPE_BRIDGE.replaceElement(element, safeReplacement);
}

/**
 * Logic: Tree-walking sanitization process.
 * Recursively visits all nodes, including those inside `<template>` fragments,
 * to apply security policies and neutralize dangerous elements.
 *
 * @internal
 */
function executeSanitizationWalk(
  root: Node | DocumentFragment,
  policy: SanitizationPolicy = DEFAULT_POLICY
): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const processingQueue: HTMLElement[] = [];

  let currentElement = walker.nextNode() as HTMLElement | null;
  while (currentElement) {
    processingQueue.push(currentElement);
    if (DOM_PROTOTYPE_BRIDGE.getLocalName(currentElement) === 'template') {
      executeSanitizationWalk((currentElement as HTMLTemplateElement).content, policy);
    }
    currentElement = walker.nextNode() as HTMLElement | null;
  }

  for (const node of processingQueue) {
    applySecurityPolicy(node, policy);
    neutralizeDangerousNode(node, policy);
  }
}

// --- Public APIs ---

/**
 * Cleanses a raw HTML string to prevent XSS attacks.
 *
 * When to use:
 * - Before injecting untrusted HTML strings into the DOM via `$.fn.atomHtml`.
 * - When processing user-provided markup for display.
 *
 * Logic: Uses a detached `<template>` element to parse and walk the DOM tree
 * without executing any malicious payloads during the scrubbing process.
 *
 * @param html - The raw HTML string to cleanse.
 * @returns A sanitized HTML string safe for browser execution.
 *
 * @example
 * ```typescript
 * import { sanitizeHtml } from '@but212/atom-effect-jquery';
 *
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
 * Validates whether an attribute value contains dangerous protocols or scripts.
 *
 * When to use:
 * - To validate individual attribute updates in `$.fn.atomAttr`.
 * - To prevent protocol smuggling (e.g., `javascript:`) in dynamic bindings.
 *
 * @param attribute - The name of the HTML attribute (e.g., 'href', 'src', 'srcdoc').
 * @param value - The material to validate.
 * @param policy - Optional custom security policy. Defaults to `DEFAULT_POLICY`.
 * @returns `true` if the value is deemed dangerous under the current policy.
 *
 * @example
 * ```typescript
 * import { isDangerousUrl } from '@but212/atom-effect-jquery';
 *
 * isDangerousUrl('href', 'javascript:alert(1)'); // true
 * isDangerousUrl('src', 'https://safe.com/img.png'); // false
 * ```
 *
 * @public
 */
export const isDangerousUrl = (
  attribute: string,
  value: string,
  policy: SanitizationPolicy = DEFAULT_POLICY
): boolean => {
  const lowerAttribute = attribute.toLowerCase();
  if (!policy.urlAttributes.includes(lowerAttribute)) return false;

  const normalizedValue = normalizeValue(value);
  return lowerAttribute === 'srcdoc'
    ? containsDangerousHtml(normalizedValue, policy)
    : isDangerousProtocol(normalizedValue);
};

/**
 * Validates whether a CSS property value contains dangerous patterns.
 *
 * When to use:
 * - To validate dynamic style updates in `$.fn.atomCss`.
 * - To detect legacy IE behaviors or modern obfuscated URI protocols in CSS.
 *
 * Logic: Strips comments and decodes entities before matching against
 * forbidden patterns like `expression()` or `url(javascript:...)`.
 *
 * @param value - The CSS property value to validate.
 * @param policy - Optional custom security policy. Defaults to `DEFAULT_POLICY`.
 * @returns `true` if the value contains dangerous patterns.
 *
 * @example
 * ```typescript
 * import { isDangerousCssValue } from '@but212/atom-effect-jquery';
 *
 * isDangerousCssValue('url(javascript:alert(1))'); // true
 * isDangerousCssValue('red'); // false
 * ```
 *
 * @public
 */
export const isDangerousCssValue = (
  value: string,
  policy: SanitizationPolicy = DEFAULT_POLICY
): boolean => {
  const cleanCss = normalizeValue(value).replace(/\/\*[\s\S]*?\*\//g, '');
  return policy.cssDangerPatterns.some((pattern) => pattern.test(cleanCss));
};
