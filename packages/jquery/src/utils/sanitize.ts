import { SYSTEM_SECURITY } from '@/constants';

// ─── Types & Configuration ───────────────────────────────────────────────────

/**
 * Defines the security boundaries and rules for the HTML sanitization engine.
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
 * Following the principle of "Least Privilege" and "Data-Driven Security."
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
    'isindex',
    'body',
  ],
  cssDangerPatterns: [
    /expression\s*\(/i,
    /behavior\s*:/i,
    /-moz-binding\s*:/i,
    /@import/i,
    new RegExp(`url\\s*\\(\\s*["']?\\s*${SYSTEM_SECURITY.DANGEROUS_PROTOCOL_PATTERN}\\s*:`, 'i'),
    /data\s*:\s*(?!image\/)/i,
  ],
};

// ─── Regex & Lookups ─────────────────────────────────────────────────────────

const HTML_ENTITY_LOOKUP: Record<string, string> = { colon: ':', tab: '\t', newline: '\n' };
const REGEX_NUMERIC_ENTITY = /&#x([0-9a-f]+);?|&#([0-9]+);?/gi;
const REGEX_NAMED_ENTITY = /&(colon|tab|newline);?/gi;
// biome-ignore lint/suspicious/noControlCharactersInRegex: sanitize need to use control characters
const REGEX_CONTROL_CHARS = /[\x00-\x1f\x7f]/g;
const REGEX_DATA_URI_HTML =
  /data\s*:\s*(?:text\/(?:html|javascript|vbscript|xml)|application\/(?:javascript|xhtml\+xml|xml|x-shockwave-flash)|image\/svg\+xml)/i;
const REGEX_PROTOCOL_STRICT = new RegExp(
  `(?:^|url\\s*\\(\\s*["']?)\\s*${SYSTEM_SECURITY.DANGEROUS_PROTOCOL_PATTERN}\\s*:`,
  'i'
);

/** Detects if a string contains dangerous HTML structures under a specific policy. */
function containsDangerousHtml(val: string, policy: SanitizationPolicy): boolean {
  const normalized = normalize(val);
  const low = normalized.toLowerCase();
  return (
    policy.blacklistedTags.some((tag) => low.includes(`<${tag}`)) ||
    /\bon\w+\s*=/i.test(normalized) ||
    isDangerousUri(normalized)
  );
}

// ─── Safe DOM Bridge ─────────────────────────────────────────────────────────

/**
 * Prevents DOM Clobbering by accessing descriptors directly from prototypes.
 */
const DOM = {
  attr: (el: Element) =>
    Object.getOwnPropertyDescriptor(Element.prototype, 'attributes')!.get!.call(el) as NamedNodeMap,
  setAttr: (el: Element, k: string, v: string) => Element.prototype.setAttribute.call(el, k, v),
  remAttr: (el: Element, k: string) => Element.prototype.removeAttribute.call(el, k),
  replace: (old: Element, neu: Node) => Element.prototype.replaceWith.call(old, neu),
  name: (el: Element) =>
    Object.getOwnPropertyDescriptor(Element.prototype, 'localName')!.get!.call(el) as string,
  first: (n: Node) =>
    Object.getOwnPropertyDescriptor(Node.prototype, 'firstChild')!.get!.call(n) as ChildNode | null,
};

// ─── Internal Logic ──────────────────────────────────────────────────────────

/** Normalizes strings by decoding entities and removing control characters. */
function normalize(val: string): string {
  if (typeof val !== 'string') return '';
  return val
    .replace(REGEX_NUMERIC_ENTITY, (_, hex, dec) => {
      const code = hex ? parseInt(hex, 16) : parseInt(dec, 10);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(REGEX_NAMED_ENTITY, (_, n) => HTML_ENTITY_LOOKUP[n.toLowerCase()] ?? '')
    .replace(REGEX_CONTROL_CHARS, '')
    .replace(/\ufffd/g, '');
}

/** Detects dangerous URI protocols (javascript, vbscript, data:html, etc.) */
function isDangerousUri(val: string): boolean {
  if (typeof val !== 'string') return false;
  const normalized = normalize(val).replace(/\s+/g, '');
  return REGEX_PROTOCOL_STRICT.test(normalized) || REGEX_DATA_URI_HTML.test(normalized);
}

/** Detects dangerous patterns in CSS. */
function isCssDangerous(val: string, policy: SanitizationPolicy): boolean {
  const clean = normalize(val).replace(/\/\*[\s\S]*?\*\//g, '');
  return policy.cssDangerPatterns.some((p) => p.test(clean));
}

/** Handles specialized attributes like srcdoc, srcset, and style. */
const SPECIAL_SCRUBBERS: Record<
  string,
  (el: HTMLElement, k: string, v: string, p: SanitizationPolicy) => void
> = {
  srcdoc: (el, k, v, p) => DOM.setAttr(el, k, sanitizeHtml(normalize(v), p)),
  srcset: (el, k, v) =>
    DOM.setAttr(
      el,
      k,
      v
        .split(',')
        .map((part) => {
          const trimmed = part.trim();
          if (!trimmed) return part;
          const [url, ...meta] = trimmed.split(/\s+/);
          return isDangerousUri(url!)
            ? ['data-unsafe-protocol:', ...meta].join(' ')
            : [normalize(url!), ...meta].join(' ');
        })
        .join(',')
    ),
  style: (el, _, v, p) => isCssDangerous(v, p) && DOM.setAttr(el, 'style', 'data-unsafe-css:'),
};

/** Applies security policies to all attributes of an element. */
function scrubAttributes(el: HTMLElement, policy: SanitizationPolicy): void {
  const attrs = DOM.attr(el);
  if (!attrs) return;

  const events: string[] = [];
  for (let i = attrs.length - 1; i >= 0; i--) {
    const { name, value } = attrs[i]!;
    const lowName = name.toLowerCase();

    // Block event handlers and smuggled protocols in attribute names
    if (lowName.startsWith('on') || isDangerousUri(name)) {
      DOM.remAttr(el, name);
      if (lowName.startsWith('on')) {
        events.push(name);
      }
      continue;
    }

    // SVG/MathML animation vectors
    if (['attributename', 'from', 'to', 'values'].includes(lowName)) {
      if (value.toLowerCase().startsWith('on') || isDangerousUri(value)) {
        DOM.remAttr(el, name);
        continue;
      }
    }

    if (SPECIAL_SCRUBBERS[lowName]) {
      SPECIAL_SCRUBBERS[lowName]!(el, lowName, value, policy);
    } else if (policy.urlAttributes.includes(lowName)) {
      if (isDangerousUri(value)) DOM.setAttr(el, name, 'data-unsafe-protocol:');
    }
  }

  if (events.length) DOM.setAttr(el, 'data-unsafe-attr', events.join(','));
}

/** Transforms blacklisted tags into safe <span> containers. */
function neutralize(el: HTMLElement, policy: SanitizationPolicy): void {
  if (!policy.blacklistedTags.includes(DOM.name(el))) return;

  const span = document.createElement('span');
  const attrs = DOM.attr(el);
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    if (a) span.setAttribute(a.name, a.value);
  }

  scrubAttributes(span, policy);

  let child = DOM.first(el);
  while (child) {
    span.appendChild(child);
    child = DOM.first(el);
  }
  DOM.replace(el, span);
}

/** Walks the tree recursively (handling templates) to sanitize all nodes. */
function walk(root: Node | DocumentFragment, policy: SanitizationPolicy): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const queue: HTMLElement[] = [];

  let curr = walker.nextNode() as HTMLElement | null;
  while (curr) {
    queue.push(curr);
    if (DOM.name(curr) === 'template') walk((curr as HTMLTemplateElement).content, policy);
    curr = walker.nextNode() as HTMLElement | null;
  }

  for (const node of queue) {
    scrubAttributes(node, policy);
    neutralize(node, policy);
  }
}

// ─── Public APIs ────────────────────────────────────────────────────────────

/**
 * Cleanses HTML strings to prevent XSS. Uses a hybrid strategy for fragments vs full docs.
 */
export function sanitizeHtml(
  html: string | null | undefined,
  policy: SanitizationPolicy = DEFAULT_POLICY
): string {
  if (!html) return '';
  const input = String(html);

  // Hybrid Strategy: Preserve top-level tags by using a full document when necessary
  if (/<(?:body|head|html|footer|header)/i.test(input)) {
    const doc = document.implementation.createHTMLDocument('');
    doc.documentElement.innerHTML = input;
    walk(doc.documentElement, policy);
    return doc.documentElement.innerHTML;
  }

  const tmp = document.createElement('template');
  tmp.innerHTML = input;
  walk(tmp.content, policy);
  return tmp.innerHTML;
}

/** Validates if an attribute value contains dangerous protocols. */
export const isDangerousUrl = (
  attr: string,
  val: string,
  policy: SanitizationPolicy = DEFAULT_POLICY
): boolean => {
  const lowAttr = attr.toLowerCase();
  if (!policy.urlAttributes.includes(lowAttr)) return false;
  return lowAttr === 'srcdoc' ? containsDangerousHtml(val, policy) : isDangerousUri(val);
};

/** Validates if a CSS value contains dangerous patterns. */
export const isDangerousCssValue = (
  val: string,
  policy: SanitizationPolicy = DEFAULT_POLICY
): boolean => isCssDangerous(val, policy);
