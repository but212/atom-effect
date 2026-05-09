import { SYSTEM_SECURITY } from '@/constants';

/**
 * Configuration for the HTML sanitization engine.
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

// ─── Internal Constants ──────────────────────────────────────────────────────

/**
 * @internal
 * Dictionaries for entity mapping and DOM protection.
 */
const DICT = {
  /** Map of safe replacements for common HTML entities. */
  ENTITIES: {
    colon: ':',
    tab: '\t',
    newline: '\n',
    lt: '<',
    gt: '>',
    amp: '&',
    quot: '"',
    apos: "'",
  } as Record<string, string>,
  /** Values targeted for DOM Clobbering prevention. */
  CLOBBER: {
    ATTRS: ['id', 'name'],
    VALUES: [
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
    ],
  },
  /** SVG/SMIL attributes that can be used for XSS via animation. */
  SENSITIVE: ['attributename', 'from', 'to', 'values'],
} as const;

/**
 * @internal
 * Regular expressions for security pattern matching.
 */
const REGEX = {
  /** Captures numeric HTML entities (hex or decimal). */
  NUMERIC_ENTITY: /&#x([0-9a-f]+);?|&#([0-9]+);?/gi,
  /** Captures named HTML entities defined in DICT.ENTITIES. */
  NAMED_ENTITY: new RegExp(`&(${Object.keys(DICT.ENTITIES).join('|')});?`, 'gi'),
  /**
   * Security: Filter Evasion
   * Captures control characters often used to break regex-based filters.
   */
  // biome-ignore lint/suspicious/noControlCharactersInRegex: security requirement
  CONTROL_CHARS: /[\x00-\x1f\x7f\ufffd\u0000]/g,
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

// ─── DOM Bridge (Low-level Primitives) ───────────────────────────────────────

/**
 * @internal
 * Low-level DOM bridge using proto-bound methods to bypass potential DOM Clobbering.
 *
 * Security: Prototype Hardening
 * Uses Function.prototype.call to invoke methods directly from the prototype,
 * preventing attackers from shadowing these methods on the instance.
 */
const _call = Function.prototype.call.bind(Function.prototype.call);
const _get = (p: object, k: string) => Object.getOwnPropertyDescriptor(p, k)?.get;

/** @internal */
const DOM = {
  /** Retrieves all attributes of an element reliably. */
  getAttributes: (el: Element) => {
    const getter = _get(Element.prototype, 'attributes');
    return Array.from((getter ? _call(getter, el) : el.attributes) as NamedNodeMap);
  },
  /** Sets an attribute value bypassing instance-level shadowing. */
  setAttribute: (el: Element, key: string, val: string) =>
    _call(Element.prototype.setAttribute, el, key, val),
  /** Removes an attribute bypassing instance-level shadowing. */
  removeAttribute: (el: Element, key: string) => _call(Element.prototype.removeAttribute, el, key),
  /** Replaces one node with another in the DOM tree. */
  replaceNode: (oldNode: Node, newNode: Node) => {
    if (oldNode.parentNode) {
      oldNode.parentNode.replaceChild(newNode, oldNode);
      return true;
    }
    return false;
  },
  /** Retrieves the lowercase local name of an element reliably. */
  getLocalName: (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    const getter = _get(Element.prototype, 'localName') ?? _get(Node.prototype, 'nodeName');
    return (getter ? (_call(getter, el) as string) : (el.localName ?? '')).toLowerCase();
  },
  /** Creates an HTMLElement in the current document context. */
  createElement: <T extends HTMLElement>(tag: string) => document.createElement(tag) as T,
};

// ─── Guard Logic (Pure Security Functions) ───────────────────────────────────

/**
 * @internal
 * Logic: Multi-pass Normalization
 * Performs recursive decoding and filtering to expose hidden payloads.
 */
const Guard = {
  /** Resolves HTML entities to their literal characters. */
  decodeEntities(val: string): string {
    return val
      .replace(REGEX.NUMERIC_ENTITY, (_, hex, dec) => {
        const cp = hex ? parseInt(hex, 16) : parseInt(dec, 10);
        return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
      })
      .replace(REGEX.NAMED_ENTITY, (_, name) => DICT.ENTITIES[name.toLowerCase()] ?? '');
  },

  /**
   * Security: Normalization
   * Normalizes a string by decoding entities twice (to catch double-encoding)
   * and stripping non-printable/control characters.
   */
  normalize(val: string): string {
    if (typeof val !== 'string') return '';
    return this.decodeEntities(this.decodeEntities(val)).replace(REGEX.CONTROL_CHARS, '');
  },

  /** Validates if a URI contains dangerous protocols or data types. */
  isDangerousUri(val: string): boolean {
    const clean = this.normalize(val).replace(/\s+/g, '');
    return REGEX.PROTOCOL.test(clean) || REGEX.DATA_URI.test(clean);
  },

  /**
   * Security: CSS Filtering
   * Detects script injection patterns in CSS declarations (e.g., expression, url(javascript)).
   */
  isDangerousCss(val: string): boolean {
    const clean = this.normalize(val).replace(REGEX.CSS_CLEAN, '').toLowerCase();
    if (['javascript:', 'expression(', '-moz-binding'].some((s) => clean.includes(s))) return true;
    const url = clean.match(/url\s*\(\s*["']?([^"')]*)["']?\s*\)/i)?.[1];
    return !!url && this.isDangerousUri(url);
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

// ─── Rule Engine ─────────────────────────────────────────────────────────────

/** @internal */
interface DefenseRule {
  match: (key: string, val: string, policy: SanitizationPolicy) => boolean;
  action: (el: HTMLElement, key: string, val: string, policy: SanitizationPolicy) => void;
}

/**
 * @internal
 * Orchestrates attribute-level defense logic.
 *
 * Logic: Rule Specificity & Priority
 * Rules are ordered from most specific (e.g., Style, URL) to most general (Catch-all).
 * This ensures that data with potential for partial recovery (like CSS) is sanitized
 * rather than discarded, while still enforcing a strict security boundary.
 */
const DEFENSE_RULES: DefenseRule[] = [
  {
    // Logic: Style Sanitization
    // Filters CSS properties to allow safe styles while neutralizing dangerous declarations.
    match: (k, _v, _p) => k === 'style',
    action: (el, k, v) => {
      const safeStyles = v
        .split(';')
        .map((p) => p.trim())
        .filter((p) => p && !Guard.isDangerousCss(p));
      DOM.setAttribute(el, k, safeStyles.length ? `${safeStyles.join('; ')};` : 'data-unsafe-css:');
    },
  },
  {
    // Logic: HTML Sinks (srcdoc)
    // Performs recursive sanitization on srcdoc content to ensure nested safety.
    match: (k) => k === 'srcdoc',
    action: (el, k, v, p) => DOM.setAttribute(el, k, _sanitize(v, p)),
  },
  {
    // Logic: Multi-URI Attributes (srcset)
    // Validates each URI segment within a srcset attribute.
    match: (k) => k === 'srcset',
    action: (el, k, v) => {
      const parts = v.split(',').map((part) => {
        const trimmed = part.trim();
        if (!trimmed) return part;
        const [url, ...meta] = trimmed.split(/\s+/);
        return Guard.isDangerousUri(url!)
          ? ['data-unsafe-protocol:', ...meta].join(' ')
          : [Guard.normalize(url!), ...meta].join(' ');
      });
      DOM.setAttribute(el, k, parts.join(', '));
    },
  },
  {
    // Logic: URI Enforcement
    // Enforces protocol white-listing on URI-carrying attributes.
    match: (k, v, p) => p.urlAttributes.includes(k) && Guard.isDangerousUri(v),
    action: (el, k) => DOM.setAttribute(el, k, 'data-unsafe-protocol:'),
  },
  {
    // Security: DOM Clobbering / SVG Injection
    // Blocks attributes that attempt to shadow native element properties or trigger SMIL-based XSS.
    match: (k, v, _p) =>
      ((DICT.SENSITIVE as readonly string[]).includes(k) &&
        (v.startsWith('on') || Guard.isDangerousUri(v))) ||
      ((DICT.CLOBBER.ATTRS as readonly string[]).includes(k) &&
        (DICT.CLOBBER.VALUES as readonly string[]).includes(v.toLowerCase())),
    action: (el, k) => DOM.removeAttribute(el, k),
  },
  {
    // Security: Event Handlers
    // Blocks all inline event handlers (on*).
    match: (k, _v, _p) => k.startsWith('on'),
    action: (el, k) => DOM.removeAttribute(el, k),
  },
  {
    // Security: Catch-all Protection
    // Identifies and blocks malicious keywords in both attribute names and values.
    match: (k, v, _p) =>
      k.includes('javascript') ||
      k.includes('expression') ||
      Guard.isDangerousUri(v) ||
      v.includes('javascript') ||
      v.includes('expression'),
    action: (el, k) => DOM.removeAttribute(el, k),
  },
];

// ─── Traversal & Processing ──────────────────────────────────────────────────

/**
 * @internal
 * Logic: Attribute Scrubbing
 * Iterates through all attributes of an element and applies defense rules.
 */
function scrubElement(el: HTMLElement, policy: SanitizationPolicy): void {
  const attrs = DOM.getAttributes(el);
  const detectedEvents = attrs
    .filter((a) => a.name.toLowerCase().startsWith('on'))
    .map((a) => a.name);

  for (const { name, value } of attrs) {
    const key = name.toLowerCase();
    for (const rule of DEFENSE_RULES) {
      if (rule.match(key, value, policy)) {
        rule.action(el, name, value, policy);
        break;
      }
    }
  }

  if (detectedEvents.length) {
    DOM.setAttribute(el, 'data-unsafe-attr', detectedEvents.join(','));
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
  const el = node as HTMLElement;
  const tag = DOM.getLocalName(el);

  scrubElement(el, policy);

  // 3. Logic: Blacklist Neutralization
  // Replaces forbidden elements with <span> while preserving attributes and children.
  if (policy.blacklistedTags.includes(tag)) {
    const span = DOM.createElement('span');
    // Simplified attribute mirroring.
    DOM.getAttributes(el).forEach((a) => span.setAttribute(a.name, a.value));
    scrubElement(span, policy);

    // Security: Recursive Style Protection
    if (tag === 'style' && Guard.isDangerousCss(el.textContent ?? '')) {
      span.textContent = '/* blocked */';
    } else {
      while (el.firstChild) span.appendChild(el.firstChild);
    }

    return DOM.replaceNode(el, span) ? span : el;
  }

  return el;
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

// ─── Public APIs ─────────────────────────────────────────────────────────────

/**
 * Sanitizes an HTML string based on a security policy.
 *
 * When to use:
 * - Before injecting untrusted HTML content into the DOM via `atomHtml` or jQuery methods.
 * - To filter potentially malicious attributes, event handlers, and active scripts.
 *
 * @param html The raw HTML string to be sanitized.
 * @param policy Custom sanitization policy. Defaults to `DEFAULT_POLICY`.
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
  return _sanitize(String(html), policy);
}

/**
 * Validates if a specific attribute/value pair is considered dangerous under the policy.
 *
 * @param attr The attribute name to check.
 * @param val The value to validate.
 * @param policy The policy defining URL-carrying attributes.
 *
 * @returns True if the value contains a dangerous protocol or is a restricted sink.
 */
export const isDangerousUrl = (
  attr: string,
  val: string,
  policy: SanitizationPolicy = DEFAULT_POLICY
): boolean => {
  const key = attr.toLowerCase();
  return (key === 'srcdoc' || policy.urlAttributes.includes(key)) && Guard.isDangerousUri(val);
};

/**
 * Validates if a CSS value contains dangerous patterns.
 *
 * @param val The CSS property value to check.
 * @returns True if dangerous patterns (e.g., expression, javascript) are detected.
 */
export const isDangerousCssValue = (val: string): boolean => Guard.isDangerousCss(val);
