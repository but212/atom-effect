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
// URL attribute registry
// ============================================================================

/**
 * Attributes that carry a single URL value.
 *
 * `srcset` is intentionally excluded: its value is a comma-separated list of
 * URLs (e.g. `"img.png 1x, img@2x.png 2x"`), so a start-anchored regex cannot
 * reliably detect a dangerous protocol buried after the first comma. Callers
 * that need to validate srcset should parse each URL individually.
 */
const URL_ATTRS = new Set([
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
]);

// ============================================================================
// Pre-compiled regex constants
// ============================================================================

const DANGEROUS_PROTOCOL_RE = /^\s*(?:javascript|vbscript)\s*:/i;

const DANGEROUS_CSS_RE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters for XSS sanitization
  /(?:expression\s*\(|behavior\s*:|-moz-binding\s*:|(?:\\[0-9a-f]{1,6}\s*|[\s\x00-\x20/'"])*(?:j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t|v\s*b\s*s\s*c\s*r\s*i\s*p\s*t|d\s*a\s*t\s*a)\s*:(?!image\/))/i;

/** Detects `javascript:` / `vbscript:` inside a CSS `url()` function. Non-global — no `lastIndex` state. */
const DANGEROUS_CSS_URL_RE = /url\s*\(\s*(?:["']?\s*)?(?:javascript|vbscript)\s*:/i;

// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters
const STRIP_CTRL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

/**
 * Numeric HTML entity decoder: &#NNN; and &#xHH; forms.
 *
 * Runs before protocol/tag checks so entity-encoded bypass vectors like
 * "&#106;avascript:" (j=106) are normalised to their literal characters.
 * Safe structural entities (&amp; &lt; &gt; &quot;) are intentionally left
 * encoded — they produce inert text when re-inserted via innerHTML and must
 * remain escaped for correct HTML rendering.
 *
 * The semicolon is optional (`?`) to catch unterminated references such as
 * "&#106avascript:" which some parsers still decode.
 */
const DECODE_NUMERIC_ENTITY_RE = /&#x([0-9a-f]+);?|&#([0-9]+);?/gi;

/**
 * Named-entity decoder for the small set of entities relevant to protocol
 * smuggling (colon, Tab, NewLine).
 *
 * HTML5 named character references are **case-sensitive** — `&Tab;` exists,
 * `&tab;` does not. Do NOT add the `i` flag: it would incorrectly decode
 * non-existent variants and widen the attack surface.
 */
const NAMED_ENTITY_MAP: Record<string, string> = {
  colon: ':',
  Tab: '\t',
  NewLine: '\n',
};
const DECODE_NAMED_ENTITY_RE = /&(colon|Tab|NewLine);/g;

const STRIP_XML_RE = /<\?[\s\S]*?\?>/g;

const DANGEROUS_TAG_RE =
  /(<(script|iframe|object|embed|base|meta|applet|noscript|form|style|link)\b[^>]*>([\s\S]*?)<\/\2>|<(script|iframe|object|embed|base|meta|applet|noscript|form|style|link)\b[^>]*\/?>)/gi;

const DANGEROUS_PROTOCOL_GLOBAL_RE =
  /(j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t|v\s*b\s*s\s*c\s*r\s*i\s*p\s*t)\s*:/gi;

const DANGEROUS_DATA_URI_RE =
  /data\s*:\s*(?:text\/(?:html|javascript|vbscript|xml)|application\/(?:javascript|xhtml\+xml|xml|x-shockwave-flash)|image\/svg\+xml)/gi;

const UNSAFE_ATTR_RE = /\bon\w+\s*=/gim;

/** Global variant of DANGEROUS_CSS_RE for use inside sanitizeHtml. */
const DANGEROUS_CSS_GLOBAL_RE = new RegExp(DANGEROUS_CSS_RE.source, 'gim');

// ============================================================================
// sanitizeHtml
// ============================================================================

/**
 * HTML sanitization for XSS mitigation using regex-based filtering.
 *
 * Faster than DOMParser but relies on pattern matching.
 * Neutralizes dangerous attributes (`on*`, protocols) instead of removing
 * them entirely, so the surrounding markup structure is preserved.
 *
 * **This is the final sanitization layer.** No additional sanitizer runs
 * downstream. For user-controlled rich text (WYSIWYG, markdown output, etc.)
 * use a dedicated library such as DOMPurify instead of or on top of this.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  let safe = String(html ?? '');

  // 0. Pre-process: Remove null bytes and control characters (bypass vectors)
  // These are often used to bypass regex filters while browsers ignore them.
  safe = safe.replace(STRIP_CTRL_RE, '');

  // 0b. Decode numeric HTML entities (&#NNN; / &#xHH;) and dangerous named
  // entities so that protocol-bypass vectors like "&#106;avascript:" are
  // normalised to their literal characters before the dangerous-tag and
  // dangerous-protocol regexes run.
  safe = safe.replace(DECODE_NUMERIC_ENTITY_RE, (_, hex, dec) =>
    String.fromCodePoint(hex ? parseInt(hex, 16) : parseInt(dec, 10))
  );
  safe = safe.replace(DECODE_NAMED_ENTITY_RE, (_, name) => NAMED_ENTITY_MAP[name] ?? '');

  // 1. Remove dangerous tags (script, iframe, style, etc.) and their content.
  // Note: <svg> and <math> are intentionally kept — they have legitimate uses
  // (icons, equations). Their event handlers (on*) are neutralized in step 3.
  // Also strip XML processing instructions <?...?> (abused in some parsers).
  safe = safe.replace(STRIP_XML_RE, '');

  // Loop tag removal to prevent nested reassembly bypass (e.g. "<scr<script>ipt>").
  let prev: string;
  do {
    prev = safe;
    safe = safe.replace(DANGEROUS_TAG_RE, '');
  } while (safe !== prev);

  // 2. Neutralize dangerous protocols (javascript:, vbscript:).
  // Whitespace-tolerant regex handles obfuscation like "j a v a s c r i p t:".
  safe = safe.replace(DANGEROUS_PROTOCOL_GLOBAL_RE, 'data-unsafe-protocol:');

  // Neutralize dangerous data URIs (text/html, application/javascript, image/svg+xml, etc.).
  // Common inline images (data:image/png, data:image/jpeg, etc.) are preserved.
  safe = safe.replace(DANGEROUS_DATA_URI_RE, 'data-unsafe-protocol:');

  // 3. Neutralize event handler attributes (on* = → data-unsafe-attr=).
  safe = safe.replace(UNSAFE_ATTR_RE, 'data-unsafe-attr=');

  // 4. Neutralize CSS expressions (IE legacy) and -moz-binding.
  safe = safe.replace(DANGEROUS_CSS_GLOBAL_RE, 'data-unsafe-css:');

  return safe;
}

// ============================================================================
// Security guards (used by the binding layer)
// ============================================================================

/**
 * Returns `true` when `attrName` is a URL-bearing attribute and `value`
 * contains a `javascript:` or `vbscript:` protocol.
 *
 * Only single-URL attributes are checked (see `URL_ATTRS`). `srcset` is
 * excluded because its comma-separated format requires per-URL parsing that
 * this function does not perform.
 *
 * Used by `bindAttr` to guard URL-bearing attributes.
 */
export function isDangerousUrl(attrName: string, value: string): boolean {
  if (!URL_ATTRS.has(attrName.toLowerCase())) return false;
  return DANGEROUS_PROTOCOL_RE.test(value);
}

/**
 * Returns `true` when a CSS property value contains a dangerous protocol
 * inside a `url()` function (e.g. `background-image: url("javascript:…")`).
 *
 * Uses a non-global regex to avoid `lastIndex` statefulness between calls.
 */
export function isDangerousCssValue(value: string): boolean {
  // Fast pre-check avoids running the full regex on every CSS value.
  if (!value.toLowerCase().includes('url(')) return false;
  return DANGEROUS_CSS_URL_RE.test(value);
}
