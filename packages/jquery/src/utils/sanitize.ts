import { DANGEROUS_PROTOCOL_PATTERN } from '@/constants';

/** Comprehensive list of attributes that can contain URI payloads or script contexts. */
export const URL_ATTRS = [
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

/** Tags that are stripped or transformed because they can execute scripts or hijack the context. */
const DANGEROUS_TAGS = [
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

const NAMED_ENTITY_MAP: Record<string, string> = {
  colon: ':',
  tab: '\t',
  newline: '\n',
};

const RE_NUMERIC_ENTITY = /&#x([0-9a-f]+);?|&#([0-9]+);?/gi;
const RE_NAMED_ENTITY = /&(colon|tab|newline);?/gi;
// biome-ignore lint/suspicious/noControlCharactersInRegex: sanitize html
const RE_STRIP_CTRL = /[\x00-\x1f\x7f]/g;

const RE_DANGEROUS_TAG =
  /(<(script|iframe|object|embed|base|meta|applet|noscript|form|style|link)\b[^>]*>([\s\S]*?)<\/\2>|<(script|iframe|object|embed|base|meta|applet|noscript|form|style|link)\b[^>]*\/?>)/i;
const RE_UNSAFE_ATTR = /\bon\w+\s*=/gi;

const PROTOCOL_PATTERN = `${DANGEROUS_PROTOCOL_PATTERN}\\s*:`;
const RE_DANGEROUS_PROTOCOL_GLOBAL = new RegExp(PROTOCOL_PATTERN, 'gi');
const RE_DANGEROUS_PROTOCOL_CONTEXT = new RegExp(
  `(?:^|url\\s*\\(\\s*["']?)\\s*${PROTOCOL_PATTERN}`,
  'i'
);
const RE_DANGEROUS_DATA_URI =
  /data\s*:\s*(?:text\/(?:html|javascript|vbscript|xml)|application\/(?:javascript|xhtml\+xml|xml|x-shockwave-flash)|image\/svg\+xml)/i;

const CSS_KEYWORD_PATTERN = `(?:expression\\s*\\(|behavior\\s*:|-moz-binding\\s*:|url\\s*\\(\\s*["']?\\s*${PROTOCOL_PATTERN}(?!image\\/)|data\\s*:\\s*(?!image\\/))`;
const RE_DANGEROUS_CSS_SINGLE = new RegExp(CSS_KEYWORD_PATTERN, 'im');

/**
 * Decodes HTML entities and strips control characters to reveal hidden protocols.
 *
 * Why: Attackers use entities like `j&#x61;vascript:` to bypass regex filters.
 * We must normalize the string to its plain-text representation before validation.
 */
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

function hasDangerousProtocol(s: string): boolean {
  const stripped = s.replace(/\s+/g, '');
  return RE_DANGEROUS_PROTOCOL_CONTEXT.test(stripped) || RE_DANGEROUS_DATA_URI.test(stripped);
}

function isDangerousHtmlContent(s: string): boolean {
  return RE_DANGEROUS_TAG.test(s) || RE_UNSAFE_ATTR.test(s) || RE_DANGEROUS_PROTOCOL_GLOBAL.test(s);
}

/**
 * Optimization: Reuses <template> nodes to avoid the high cost of
 * repeatedly creating DOM nodes during rapid reactive updates.
 */
const TEMPLATE_POOL: HTMLTemplateElement[] = [];

function acquireTemplate(): HTMLTemplateElement {
  return TEMPLATE_POOL.pop() || document.createElement('template');
}

function releaseTemplate(t: HTMLTemplateElement): void {
  t.innerHTML = '';
  TEMPLATE_POOL.push(t);
}

/**
 * Security Bridge: Accesses DOM properties via descriptors to prevent
 * bypass attacks that use Object.defineProperty on element instances.
 */
const DOM_BRIDGE = {
  getAttributes: (el: Element) =>
    Object.getOwnPropertyDescriptor(Element.prototype, 'attributes')!.get!.call(el) as NamedNodeMap,
  removeAttribute: (el: Element, name: string) => Element.prototype.removeAttribute.call(el, name),
  replaceWith: (oldEl: Element, newEl: Node) => Element.prototype.replaceWith.call(oldEl, newEl),
};

/** Scrubs event listeners (on*) and malicious protocols from individual element attributes. */
function scrubAttributes(el: HTMLElement): void {
  const attrs = DOM_BRIDGE.getAttributes(el);
  if (!attrs) return;

  for (let i = attrs.length - 1; i >= 0; i--) {
    const attr = attrs[i];
    if (!attr) continue;

    const name = attr.name;
    const lowerName = name.toLowerCase();

    if (lowerName.startsWith('on')) {
      DOM_BRIDGE.removeAttribute(el, name);
      el.setAttribute('data-unsafe-attr', name);
    } else if (URL_ATTRS.includes(lowerName)) {
      const normalized = normalize(attr.value);
      if (lowerName === 'srcdoc') {
        // Recursive Check: srcdoc attribute is itself a nested HTML payload.
        el.setAttribute(name, sanitizeHtml(normalized));
      } else if (hasDangerousProtocol(normalized)) {
        el.setAttribute(name, 'data-unsafe-protocol:');
      }
    } else if (lowerName === 'style' && RE_DANGEROUS_CSS_SINGLE.test(normalize(attr.value))) {
      el.setAttribute('style', 'data-unsafe-css:');
    }
  }
}

/**
 * Neutralizes dangerous tags (like <script>) by converting them to <span>,
 * effectively disabling their execution while preserving their content for debugging.
 */
function transformNode(el: HTMLElement): void {
  if (!DANGEROUS_TAGS.includes(el.localName)) return;

  const span = document.createElement('span');
  const attrs = DOM_BRIDGE.getAttributes(el);

  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    if (a) span.setAttribute(a.name, a.value);
  }

  while (el.firstChild) {
    span.appendChild(el.firstChild);
  }

  DOM_BRIDGE.replaceWith(el, span);
}

/** Recursive walker that processes a document fragment and its nested templates. */
function walkAndScrub(root: Node | DocumentFragment): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let el = walker.nextNode() as HTMLElement | null;

  const toScrub: HTMLElement[] = [];
  while (el) {
    toScrub.push(el);
    if (el.localName === 'template') {
      // Logic: walker skips template contents, so we must recurse manually.
      walkAndScrub((el as HTMLTemplateElement).content);
    }
    el = walker.nextNode() as HTMLElement | null;
  }

  for (let i = 0; i < toScrub.length; i++) {
    scrubAttributes(toScrub[i]!);
    transformNode(toScrub[i]!);
  }
}

/**
 * Sanitizes a raw HTML string by stripping dangerous tags, attributes, and protocols.
 *
 * Strategy:
 * 1. Uses a headless <template> element for native browser-speed parsing.
 * 2. Decodes obfuscated entities (numeric/named) before validation.
 * 3. Transforms blacklisted tags (script, iframe) into safe <span> containers.
 * 4. Sanitizes URL-based attributes (href, src) against malicious protocols.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';
  const sInit = String(html);

  const template = acquireTemplate();
  try {
    template.innerHTML = sInit;
    walkAndScrub(template.content);
    return template.innerHTML;
  } finally {
    releaseTemplate(template);
  }
}

export const isDangerousUrl = (attr: string, val: string): boolean => {
  const lowerAttr = attr.toLowerCase();
  if (!URL_ATTRS.includes(lowerAttr)) return false;

  const normalized = normalize(val);
  return lowerAttr === 'srcdoc'
    ? isDangerousHtmlContent(normalized)
    : hasDangerousProtocol(normalized);
};

export const isDangerousCssValue = (val: string): boolean => {
  return RE_DANGEROUS_CSS_SINGLE.test(normalize(val));
};
