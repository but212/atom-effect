/**
 * HTML sanitization and security guards for XSS mitigation.
 *
 * This module is the **sole** sanitization layer — there is no downstream
 * sanitizer (e.g. DOMPurify) applied automatically. All regex-based
 * filtering happens here before content reaches the DOM.
 *
 * **Threat model:** best-effort defence for developer-authored templates and
 * reactive string bindings. For user-controlled rich text (e.g. a WYSIWYG
 * editor), replace or supplement this with DOMPurify.
 */

// ============================================================================
// Constants & Registry
// ============================================================================

/** Attributes that carry a single URL value. */
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
]);

const NAMED_ENTITY_MAP: Record<string, string> = {
  colon: ':',
  Tab: '\t',
  NewLine: '\n',
};

// ============================================================================
// Pre-compiled regex constants
// ============================================================================

/** Normalization & Fast-path regexes */
const RE_NUMERIC_ENTITY = /&#x([0-9a-f]+);?|&#([0-9]+);?/gi;
const RE_NAMED_ENTITY = /&(colon|Tab|NewLine);/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters for XSS sanitization
const RE_STRIP_CTRL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters for XSS sanitization
const RE_FAST_SCAN = /[<&\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

/** Sanitization regexes */
const RE_STRIP_XML = /<\?[\s\S]*?\?>/g;
const RE_DANGEROUS_TAG =
  /(<(script|iframe|object|embed|base|meta|applet|noscript|form|style|link)\b[^>]*>([\s\S]*?)<\/\2>|<(script|iframe|object|embed|base|meta|applet|noscript|form|style|link)\b[^>]*\/?>)/gi;

const RE_UNSAFE_ATTR = /\bon\w+\s*=/gim;
const RE_DANGEROUS_DATA_URI =
  /data\s*:\s*(?:text\/(?:html|javascript|vbscript|xml)|application\/(?:javascript|xhtml\+xml|xml|x-shockwave-flash)|image\/svg\+xml)/gi;

/** Shared protocol pattern (handles internal whitespace/control chars) */
const PROTOCOL_PATTERN =
  '(?:j\\s*a\\s*v\\s*a\\s*s\\s*c\\s*r\\s*i\\s*p\\s*t|v\\s*b\\s*s\\s*c\\s*r\\s*i\\s*p\\s*t)';
const RE_DANGEROUS_PROTOCOL_GLOBAL = new RegExp(`${PROTOCOL_PATTERN}\\s*:`, 'gi');
export const DANGEROUS_PROTOCOL_RE = new RegExp(`^\\s*${PROTOCOL_PATTERN}\\s*:`, 'i');

/** CSS Sanitization */
const CSS_KEYWORD_PATTERN = `(?:expression\\s*\\(|behavior\\s*:|-moz-binding\\s*:|(?:\\\\[0-9a-f]{1,6}\\s*|[\\s\\x00-\\x20/'"])*${PROTOCOL_PATTERN}\\s*:(?!image\\/)|data\\s*:\\s*(?!image\\/))`;
const RE_DANGEROUS_CSS_URL = /url\s*\(\s*(?:["']?\s*)?(?:javascript|vbscript)\s*:/i;
export const DANGEROUS_CSS_GLOBAL_RE = new RegExp(CSS_KEYWORD_PATTERN, 'gim');

// ============================================================================
// Internal Helpers
// ============================================================================

/** Normalizes a string by decoding entities and stripping control characters. */
function normalize(s: string): string {
  return s
    .replace(RE_NUMERIC_ENTITY, (_, hex, dec) =>
      String.fromCodePoint(hex ? parseInt(hex, 16) : parseInt(dec, 10))
    )
    .replace(RE_NAMED_ENTITY, (_, name) => NAMED_ENTITY_MAP[name] ?? '')
    .replace(RE_STRIP_CTRL, '');
}

/**
 * O(n) single-pass scan for characters that indicate potential danger.
 * Much cheaper than running heavy regexes on safe strings.
 */
function needsSanitization(s: string): boolean {
  // Fast check for meta-characters and control codes
  if (RE_FAST_SCAN.test(s) || s.indexOf(':') !== -1) return true;

  // Check for potential event handlers: on[a-z]
  const lower = s.toLowerCase();
  let onIdx = lower.indexOf('on');
  while (onIdx !== -1 && onIdx < s.length - 2) {
    const nextChar = lower.charCodeAt(onIdx + 2);
    if (nextChar >= 97 && nextChar <= 122) return true;
    onIdx = lower.indexOf('on', onIdx + 1);
  }

  return false;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * HTML sanitization for XSS mitigation using regex-based filtering.
 * Optimized with an early-exit fast-path for safe strings.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';
  const sInit = String(html);

  // Fast path: skip expensive processing if no dangerous patterns exist.
  if (!needsSanitization(sInit)) return sInit;

  // 1. Normalize (Decode entities -> Strip control chars)
  let s = normalize(sInit);

  // 2. Strip Tags (Recursive to handle nested reassembly like <scr<script>ipt>)
  if (s.indexOf('<') !== -1) {
    s = s.replace(RE_STRIP_XML, '');
    let prev: string;
    do {
      prev = s;
      s = s.replace(RE_DANGEROUS_TAG, '');
    } while (s !== prev);
  }

  // 3. Neutralize Protocols, Data URIs, Attributes, and CSS
  return s
    .replace(RE_DANGEROUS_PROTOCOL_GLOBAL, 'data-unsafe-protocol:')
    .replace(RE_DANGEROUS_DATA_URI, 'data-unsafe-protocol:')
    .replace(RE_UNSAFE_ATTR, 'data-unsafe-attr=')
    .replace(DANGEROUS_CSS_GLOBAL_RE, 'data-unsafe-css:');
}

/** Checks for javascript:/vbscript: protocols in URL attributes. */
export const isDangerousUrl = (attr: string, val: string): boolean => {
  if (val.length < 10) return false; // "j a v a s c r i p t :".length > 10
  const lower = attr.toLowerCase();
  return URL_ATTRS.has(lower) && DANGEROUS_PROTOCOL_RE.test(val);
};

/** Checks for protocols inside CSS url() functions. */
export const isDangerousCssValue = (val: string): boolean => {
  if (val.length < 15) return false; // "url(javascript:)".length = 15
  return val.toLowerCase().includes('url(') && RE_DANGEROUS_CSS_URL.test(val);
};
