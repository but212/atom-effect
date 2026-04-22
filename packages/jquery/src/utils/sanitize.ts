import { SYSTEM_SECURITY } from '@/constants';

// ─── Configuration & Security Policy ─────────────────────────────────────────

/**
 * Defines the security boundaries and rules for the HTML sanitization engine.
 *
 * When to use:
 * - When creating a customized sanitization sandbox for specific security requirements.
 * - To override default blacklisted tags or allowed URL attributes in specialized environments.
 */
export interface SanitizationPolicy {
  /** Attributes that must be validated for dangerous URI protocols. */
  readonly urlAttributes: string[];
  /** Tags that are neutralized by transforming them into safe containers (e.g., <span>). */
  readonly blacklistedTags: string[];
  /** Patterns forbidden within CSS property values. */
  readonly cssDangerPatterns: RegExp[];
}

/**
 * The default security policy used by the library.
 *
 * Logic: Data-Driven Security
 * Following the principle that "Data dominates," this policy explicitly defines
 * the surfaces (tags, attributes, and patterns) considered dangerous by default.
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
    new RegExp(`url\\s*\\(\\s*["']?\\s*${SYSTEM_SECURITY.DANGEROUS_PROTOCOL_PATTERN}\\s*:`, 'i'), // url(javascript:...)
    /data\s*:\s*(?!image\/)/i, // data: URIs that aren't images
  ],
};

/** Mapping of common obfuscated HTML entities to their plain-text equivalents. @internal */
const HTML_ENTITY_LOOKUP: Record<string, string> = {
  colon: ':',
  tab: '\t',
  newline: '\n',
};

// ─── Regex Definitions ──────────────────────────────────────────────────────

const REGEX_NUMERIC_ENTITY = /&#x([0-9a-f]+);?|&#([0-9]+);?/gi;
const REGEX_NAMED_ENTITY = /&(colon|tab|newline);?/gi;

// Logic: Essential control character removal to prevent protocol smuggling.
// biome-ignore lint/suspicious/noControlCharactersInRegex: necessary for protocol normalization
const REGEX_CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

const REGEX_DATA_URI_HTML =
  /data\s*:\s*(?:text\/(?:html|javascript|vbscript|xml)|application\/(?:javascript|xhtml\+xml|xml|x-shockwave-flash)|image\/svg\+xml)/i;

/** Optimization: Pre-compiled strict protocol validation pattern. @internal */
const REGEX_PROTOCOL_STRICT = new RegExp(
  `(?:^|url\\s*\\(\\s*["']?)\\s*${SYSTEM_SECURITY.DANGEROUS_PROTOCOL_PATTERN}\\s*:`,
  'i'
);

// ─── Safe DOM Access ────────────────────────────────────────────────────────

/**
 * Security: DOM Clobbering Prevention
 *
 * Reason: Bridge Logic
 * Accesses DOM methods directly via `Element.prototype` to prevent bypass
 * attacks that leverage `Object.defineProperty` on element instances (DOM
 * Clobbering). This ensures the sanitizer consistently uses native browser logic.
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

// ─── Normalization & Validation Logic ───────────────────────────────────────

/**
 * Normalizes a string by decoding entities and removing control characters.
 *
 * Logic: Obfuscation Removal
 * Decodes numeric and named HTML entities and strips non-printable control
 * characters to reveal hidden protocols (e.g., `j&#x61;vascript:`).
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
 * Checks if a value contains a dangerous URI protocol.
 * @internal
 */
function isDangerousProtocol(value: string): boolean {
  const cleanedValue = value.replace(/\s+/g, '');
  return REGEX_PROTOCOL_STRICT.test(cleanedValue) || REGEX_DATA_URI_HTML.test(cleanedValue);
}

/**
 * Detects if a string contains dangerous HTML structures under a specific policy.
 *
 * Reason: Explicit Validation
 * This method uses discrete, readable checks rather than a single complex
 * regular expression. This reduces false positives and simplifies maintenance
 * as new attack vectors are identified.
 *
 * @internal
 */
function containsDangerousHtml(value: string, policy: SanitizationPolicy): boolean {
  const normalized = normalizeValue(value);
  const lowerValue = normalized.toLowerCase();

  if (policy.blacklistedTags.some((tag) => lowerValue.includes(`<${tag}`))) {
    return true;
  }

  if (/\bon\w+\s*=/i.test(normalized)) {
    return true;
  }

  if (isDangerousProtocol(normalized)) {
    return true;
  }

  return false;
}

/**
 * Sanitizes the `srcset` attribute which may contain multiple URLs.
 *
 * Caution: Protocol Smuggling
 * Malicious protocols can be injected between safe sources in comma-separated
 * values. Each segment must be parsed and validated individually.
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
  // Logic: CSS comments are stripped to prevent payloads hidden within /* ... */
  return normalized.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** @internal */
function isCssDangerous(value: string, policy: SanitizationPolicy): boolean {
  const cleanCss = normalizeCss(value);
  return policy.cssDangerPatterns.some((pattern) => pattern.test(cleanCss));
}

// ─── Attribute Specific Scrubbers ───────────────────────────────────────────

/**
 * Logic: Specialized Attribute Handlers
 * Specific attributes like `srcdoc`, `srcset`, and `style` require recursive
 * or pattern-based sanitization.
 */
const ATTRIBUTE_HANDLERS: Record<
  string,
  (element: HTMLElement, name: string, value: string, policy: SanitizationPolicy) => void
> = {
  srcdoc: (element, name, value, policy) => {
    const normalizedValue = normalizeValue(value);
    DOM_PROTOTYPE_BRIDGE.setAttribute(element, name, sanitizeHtml(normalizedValue, policy));
  },
  srcset: (element, name, value) => {
    DOM_PROTOTYPE_BRIDGE.setAttribute(element, name, scrubSrcset(value));
  },
  style: (element, _, value, policy) => {
    if (isCssDangerous(value, policy)) {
      DOM_PROTOTYPE_BRIDGE.setAttribute(element, 'style', 'data-unsafe-css:');
    }
  },
};

// ─── Scrubber Core ──────────────────────────────────────────────────────────

/**
 * Applies security policies to an element's attribute collection.
 *
 * Logic: Attribute Scrubbing
 * Iterates through all attributes, removing event handlers (on*) and
 * neutralizing dangerous protocols in URL-based attributes.
 *
 * @internal
 */
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
      ATTRIBUTE_HANDLERS[lowerName]!(element, name, value, policy);
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
 * Neutralizes dangerous tags by converting them into safe `<span>` containers.
 *
 * Logic: Tag Neutralization
 * Blacklisted tags (e.g., `<script>`, `<iframe>`) are replaced with `<span>`
 * elements. Their non-executable children are preserved, but all attributes
 * are subjected to the standard security policy.
 *
 * @internal
 */
function neutralizeDangerousNode(element: HTMLElement, policy: SanitizationPolicy): void {
  if (!policy.blacklistedTags.includes(DOM_PROTOTYPE_BRIDGE.getLocalName(element))) {
    return;
  }

  const safeReplacement = document.createElement('span');
  const attributes = DOM_PROTOTYPE_BRIDGE.getAttributes(element);

  for (let i = 0; i < attributes.length; i++) {
    const attr = attributes[i];
    if (attr) {
      safeReplacement.setAttribute(attr.name, attr.value);
    }
  }

  applySecurityPolicy(safeReplacement, policy);

  let child = DOM_PROTOTYPE_BRIDGE.getFirstChild(element);
  while (child) {
    safeReplacement.appendChild(child);
    child = DOM_PROTOTYPE_BRIDGE.getFirstChild(element);
  }

  DOM_PROTOTYPE_BRIDGE.replaceElement(element, safeReplacement);
}

/**
 * Performs a recursive tree-walking sanitization.
 *
 * Logic: Tree Traversal
 * Recursively visits all elements, including those inside `<template>` fragments,
 * to apply the security policy and neutralize dangerous elements.
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

// ─── Public APIs ────────────────────────────────────────────────────────────

/**
 * Cleanses a raw HTML string to prevent cross-site scripting (XSS) attacks.
 *
 * When to use:
 * - Before injecting untrusted HTML strings into the DOM via reactive bindings.
 * - When processing user-provided markup for safe display.
 *
 * Logic: Template Parsing
 * Uses a detached `<template>` element to parse and walk the DOM tree. This
 * ensures that no malicious scripts or event handlers are executed during the
 * scrubbing process.
 *
 * @param html - The raw HTML string to cleanse.
 * @returns A sanitized HTML string safe for document insertion.
 *
 * @example
 * ```typescript
 * const dirty = '<img src=x onerror=alert(1)>';
 * const clean = sanitizeHtml(dirty);
 * // Result: <img src="x" data-unsafe-attr="onerror">
 * ```
 */
export function sanitizeHtml(
  html: string | null | undefined,
  policy: SanitizationPolicy = DEFAULT_POLICY
): string {
  if (!html) return '';
  const template = document.createElement('template');
  template.innerHTML = String(html);
  executeSanitizationWalk(template.content, policy);
  return template.innerHTML;
}

/**
 * Validates whether an attribute value contains dangerous protocols or scripts.
 *
 * When to use:
 * - To validate individual attribute updates in `$.fn.atomAttr`.
 * - To prevent protocol smuggling (e.g., `javascript:`) in dynamic bindings.
 *
 * @param attribute - The name of the HTML attribute (e.g., 'href', 'src').
 * @param value - The material to validate.
 * @param policy - Optional security policy (defaults to DEFAULT_POLICY).
 * @returns `true` if the value is deemed dangerous.
 */
export const isDangerousUrl = (
  attribute: string,
  value: string,
  policy: SanitizationPolicy = DEFAULT_POLICY
): boolean => {
  const lowerAttribute = attribute.toLowerCase();
  if (!policy.urlAttributes.includes(lowerAttribute)) {
    return false;
  }

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
 * Logic: Sanitization Pre-processing
 * Decodes entities and strips comments before matching against forbidden
 * patterns like `expression()` or `url(javascript:...)`.
 *
 * @param value - The CSS property value to validate.
 * @param policy - Optional security policy (defaults to DEFAULT_POLICY).
 * @returns `true` if the value contains dangerous patterns.
 */
export const isDangerousCssValue = (
  value: string,
  policy: SanitizationPolicy = DEFAULT_POLICY
): boolean => {
  const cleanCss = normalizeValue(value).replace(/\/\*[\s\S]*?\*\//g, '');
  return policy.cssDangerPatterns.some((pattern) => pattern.test(cleanCss));
};
