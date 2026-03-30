/**
 * Constants for atom-effect-jquery
 */

// ============================================================================
// Log Prefixes
// ============================================================================

/**
 * Log prefixes keyed by subsystem.
 * Each prefix names the specific subsystem that emitted the message so that
 * console output is unambiguous regardless of which binding triggered it.
 */
export const LOG_PREFIXES = {
  ROUTE: '[atom-route]',
  BINDING: '[atom-binding]',
  LIST: '[atom-list]',
  MOUNT: '[atom-mount]',
} as const;

export const ROUTE_DEFAULTS = Object.freeze({
  mode: 'hash',
  basePath: '',
  autoBindLinks: false,
  activeClass: 'active',
} as const);

export const INPUT_DEFAULTS = { EVENT: 'input', DEBOUNCE: 0 } as const;
export const DEBUG_DEFAULTS = { HIGHLIGHT_DURATION_MS: 500 } as const;

export const VALID_INPUT_TAGS: ReadonlySet<string> = new Set(['input', 'select', 'textarea']);

export const URL_PROPS: ReadonlySet<string> = new Set([
  'src',
  'href',
  'action',
  'formaction',
  'data',
  'poster',
  'background',
  'cite',
  'longdesc',
  'profile',
  'usemap',
  'classid',
  'codebase',
  'xlink:href',
]);

export const DANGEROUS_PROPS: ReadonlySet<string> = new Set([
  'innerHTML',
  'outerHTML',
  'srcdoc',
  '__proto__',
  'constructor',
  'prototype',
]);

export const ERROR_MESSAGES = {
  ROUTE: {
    NOT_FOUND: (n: string) => `Route "${n}" not found and no notFound route configured`,
    TEMPLATE_NOT_FOUND: (s: string) => `Template "${s}" not found`,
    TARGET_NOT_FOUND: (s: string) => `Target element "${s}" not found`,
    MALFORMED_URI: (r: string) => `Malformed URI component: ${r}`,
  },
  SECURITY: {
    UNSAFE_CONTENT: () => 'Unsafe content neutralized during sanitization.',
    BLOCKED_CSS_VALUE: (p: string) => `Blocked dangerous value in CSS style property "${p}".`,
    BLOCKED_EVENT_HANDLER: (n: string) =>
      `Blocked setting dangerous event handler attribute/property "${n}".`,
    BLOCKED_PROTOCOL: (n: string) => `Blocked dangerous protocol in "${n}".`,
    BLOCKED_PROP: (n: string) =>
      `Blocked setting dangerous property "${n}". Use html binding for sanitized HTML.`,
  },
  BINDING: {
    INVALID_INPUT_ELEMENT: (t: string) => `Val binding used on non-input element <${t}>.`,
    MISSING_SOURCE: (m: string) => `[${m}] source is required when prop/name is a string.`,
    MISSING_CONDITION: (m: string) => `[${m}] condition is required when className is a string.`,
    UPDATER_ERROR: (d: string, s?: boolean) =>
      `Updater threw in binding "${d}"${s ? ' (static)' : ''}`,
    CLEANUP_ERROR: (i?: string) => `Binding cleanup error${i ? `: ${i}` : ''}`,
    PARSE_ERROR: (d?: string) => `parse() threw during DOM→Atom sync${d ? `: ${d}` : ''}`,
  },
  LIST: {
    DUPLICATE_KEY: (k: string | number, i: number, c: string) =>
      `Duplicate key "${k}" at index ${i} in atomList <${c}>.`,
  },
  MOUNT: {
    ERROR: (n?: string) => `Mount error${n ? ` in component <${n}>` : ''}`,
    CLEANUP_ERROR: (n?: string) => `Cleanup error${n ? ` in component <${n}>` : ''}`,
  },
  CORE: {
    EFFECT_DISPOSE_ERROR: (i?: string) => `Effect dispose error${i ? `: ${i}` : ''}`,
  },
} as const;
