import { DANGEROUS_PROTOCOL_PATTERN } from '@/constants';

/** Comprehensive list of attributes that can contain URI payloads or script contexts. */
const URL_ATTRIBUTES = new Set([
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

/** Tags that are stripped or transformed because they can execute scripts or hijack the context. */
const BLACKLISTED_TAGS = new Set([
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

/** Mapping of obfuscated HTML entities to their plain-text equivalents. */
const HTML_ENTITY_LOOKUP: Record<string, string> = {
  colon: ':',
  tab: '\t',
  newline: '\n',
};

const RE_NUMERIC_ENTITY = /&#x([0-9a-f]+);?|&#([0-9]+);?/gi;
const RE_NAMED_ENTITY = /&(colon|tab|newline);?/gi;
// biome-ignore lint/suspicious/noControlCharactersInRegex: necessary for protocol normalization
const RE_CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

const DANGEROUS_PROTOCOL_REGEX_STR = `${DANGEROUS_PROTOCOL_PATTERN}\\s*:`;
const RE_PROTOCOL_STRICT = new RegExp(
  `(?:^|url\\s*\\(\\s*["']?)\\s*${DANGEROUS_PROTOCOL_REGEX_STR}`,
  'i'
);
const RE_DANGEROUS_DATA_URI =
  /data\s*:\s*(?:text\/(?:html|javascript|vbscript|xml)|application\/(?:javascript|xhtml\+xml|xml|x-shockwave-flash)|image\/svg\+xml)/i;

const RE_CSS_EXPRESSIONS = new RegExp(
  `(?:expression\\s*\\(|behavior\\s*:|-moz-binding\\s*:|url\\s*\\(\\s*["']?\\s*${DANGEROUS_PROTOCOL_REGEX_STR}(?!image\\/)|data\\s*:\\s*(?!image\\/))`,
  'im'
);

const RE_DANGEROUS_CONTENT_SNIFFER = new RegExp(
  `(<(script|iframe|object|embed|base|meta|applet|noscript|form|style|link)\\b[^>]*>([\\s\\S]*?)<\\/\\2>|<(script|iframe|object|embed|base|meta|applet|noscript|form|style|link)\\b[^>]*\\/?>)|\\bon\\w+\\s*=|${DANGEROUS_PROTOCOL_REGEX_STR}|${RE_DANGEROUS_DATA_URI.source}`,
  'i'
);

/**
 * Security Bridge: Accesses DOM properties via descriptors to prevent
 * bypass attacks that use Object.defineProperty on element instances (DOM Clobbering).
 */
const DOM_ACCESSOR = {
  getAttributes: (el: Element) =>
    Object.getOwnPropertyDescriptor(Element.prototype, 'attributes')!.get!.call(el) as NamedNodeMap,
  setAttribute: (el: Element, name: string, val: string) =>
    Element.prototype.setAttribute.call(el, name, val),
  removeAttribute: (el: Element, name: string) => Element.prototype.removeAttribute.call(el, name),
  replaceElement: (oldEl: Element, newEl: Node) => Element.prototype.replaceWith.call(oldEl, newEl),
  getLocalName: (el: Element) =>
    Object.getOwnPropertyDescriptor(Element.prototype, 'localName')!.get!.call(el) as string,
  getFirstChild: (el: Node) =>
    Object.getOwnPropertyDescriptor(Node.prototype, 'firstChild')!.get!.call(
      el
    ) as ChildNode | null,
};

/**
 * Decodes HTML entities and strips control characters to reveal hidden protocols.
 *
 * Why: Attackers use entities like `j&#x61;vascript:` to bypass regex filters.
 * We must normalize the string to its plain-text representation before validation.
 */
function normalizeValue(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(RE_NUMERIC_ENTITY, (_, hex, dec) => {
      const codePoint = hex ? parseInt(hex, 16) : parseInt(dec, 10);
      return codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '';
    })
    .replace(RE_NAMED_ENTITY, (_, name) => HTML_ENTITY_LOOKUP[name.toLowerCase()] ?? '')
    .replace(RE_CONTROL_CHARS, '');
}

function isProtocolDangerous(value: string): boolean {
  const stripped = value.replace(/\s+/g, '');
  return RE_PROTOCOL_STRICT.test(stripped) || RE_DANGEROUS_DATA_URI.test(stripped);
}

/**
 * Security Patch: srcset can contain comma-separated URLs.
 * Each must be sanitized individually to prevent protocol smuggling.
 */
function scrubSrcset(value: string): string {
  return value
    .split(',')
    .map((candidate) => {
      const part = candidate.trim();
      if (!part) return candidate;
      const [url, ...metadata] = part.split(/\s+/);
      return isProtocolDangerous(normalizeValue(url!))
        ? ['data-unsafe-protocol:', ...metadata].join(' ')
        : candidate;
    })
    .join(',');
}

/** Scrubs event listeners (on*) and malicious protocols from individual element attributes. */
function applySecurityPolicy(element: HTMLElement): void {
  const attributes = DOM_ACCESSOR.getAttributes(element);
  if (!attributes) return;

  const scrubbedEventHandlers: string[] = [];

  for (let i = attributes.length - 1; i >= 0; i--) {
    const attr = attributes[i]!;
    const name = attr.name;
    const lowerName = name.toLowerCase();
    const value = attr.value;

    // 1. Event Handlers (on*)
    if (lowerName.startsWith('on')) {
      DOM_ACCESSOR.removeAttribute(element, name);
      scrubbedEventHandlers.push(name);
      continue;
    }

    // 2. URL-based Attributes
    if (URL_ATTRIBUTES.has(lowerName)) {
      if (lowerName === 'srcdoc') {
        // Recursive Check: srcdoc attribute is itself a nested HTML payload.
        DOM_ACCESSOR.setAttribute(element, name, sanitizeHtml(normalizeValue(value)));
      } else if (lowerName === 'srcset') {
        DOM_ACCESSOR.setAttribute(element, name, scrubSrcset(value));
      } else if (isProtocolDangerous(normalizeValue(value))) {
        DOM_ACCESSOR.setAttribute(element, name, 'data-unsafe-protocol:');
      }
      continue;
    }

    // 3. CSS Sinks
    if (lowerName === 'style' && RE_CSS_EXPRESSIONS.test(normalizeValue(value))) {
      DOM_ACCESSOR.setAttribute(element, 'style', 'data-unsafe-css:');
    }
  }

  if (scrubbedEventHandlers.length > 0) {
    DOM_ACCESSOR.setAttribute(element, 'data-unsafe-attr', scrubbedEventHandlers.join(','));
  }
}

/**
 * Neutralizes dangerous tags (like <script>) by converting them to <span>,
 * effectively disabling their execution while preserving their content for debugging.
 */
function neutralizeDangerousNode(element: HTMLElement): void {
  if (!BLACKLISTED_TAGS.has(DOM_ACCESSOR.getLocalName(element))) return;

  const safeReplacement = document.createElement('span');
  const attributes = DOM_ACCESSOR.getAttributes(element);

  for (let i = 0; i < attributes.length; i++) {
    const attr = attributes[i];
    if (attr) safeReplacement.setAttribute(attr.name, attr.value);
  }

  let child = DOM_ACCESSOR.getFirstChild(element);
  while (child) {
    safeReplacement.appendChild(child);
    child = DOM_ACCESSOR.getFirstChild(element);
  }

  DOM_ACCESSOR.replaceElement(element, safeReplacement);
}

/** Recursive walker that processes a document fragment and its nested templates. */
function executeSanitizationWalk(root: Node | DocumentFragment): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const processingQueue: HTMLElement[] = [];

  let current = walker.nextNode() as HTMLElement | null;
  while (current) {
    processingQueue.push(current);
    if (DOM_ACCESSOR.getLocalName(current) === 'template') {
      // Logic: walker skips template contents, so we must recurse manually.
      executeSanitizationWalk((current as HTMLTemplateElement).content);
    }
    current = walker.nextNode() as HTMLElement | null;
  }

  for (const node of processingQueue) {
    applySecurityPolicy(node);
    neutralizeDangerousNode(node);
  }
}

/**
 * Optimization: Reuses <template> nodes to avoid the high cost of
 * repeatedly creating DOM nodes during rapid reactive updates.
 */
const TEMPLATE_CACHE: HTMLTemplateElement[] = [];

function acquireTemplate(): HTMLTemplateElement {
  return TEMPLATE_CACHE.pop() || document.createElement('template');
}

function releaseTemplate(template: HTMLTemplateElement): void {
  template.innerHTML = '';
  TEMPLATE_CACHE.push(template);
}

/**
 * Sanitizes a raw HTML string by stripping dangerous tags, attributes, and protocols.
 *
 * Strategy:
 * 1. Uses a headless <template> element for native browser-speed parsing (Template Pooling).
 * 2. Decodes obfuscated entities (numeric/named) before validation.
 * 3. Transforms blacklisted tags (script, iframe) into safe <span> containers.
 * 4. Sanitizes URL-based attributes (href, src, srcset) against malicious protocols.
 * 5. Recursively cleanses nested contexts like <template> content and srcdoc.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';
  const template = acquireTemplate();
  try {
    template.innerHTML = String(html);
    executeSanitizationWalk(template.content);
    return template.innerHTML;
  } finally {
    releaseTemplate(template);
  }
}

/** Checks if a specific attribute/value pair contains dangerous content. */
export const isDangerousUrl = (attr: string, value: string): boolean => {
  const lowerAttr = attr.toLowerCase();
  if (!URL_ATTRIBUTES.has(lowerAttr)) return false;

  const normalized = normalizeValue(value);
  return lowerAttr === 'srcdoc'
    ? RE_DANGEROUS_CONTENT_SNIFFER.test(normalized)
    : isProtocolDangerous(normalized);
};

/** Checks if a CSS value contains dangerous expressions or protocols. */
export const isDangerousCssValue = (value: string): boolean => {
  return RE_CSS_EXPRESSIONS.test(normalizeValue(value));
};
