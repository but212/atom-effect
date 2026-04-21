/**
 * Logic: Subsystem Organization
 * Group prefixes, defaults, and error messages into cohesive logical units
 * to improve maintainability and provide clear namespaces across the library.
 *
 * @internal
 */

export const SYSTEM_CORE = {
  ERRORS: {
    EFFECT_DISPOSE_ERROR: (i?: string) => `Dispose error${i ? `: ${i}` : ''}`,
  },
} as const;

export const SYSTEM_ROUTE = {
  PREFIX: '[atom-route]',
  DEFAULTS: Object.freeze({
    mode: 'hash',
    basePath: '',
    autoBindLinks: false,
    activeClass: 'active',
  } as const),
  ERRORS: {
    NOT_FOUND: (n: string) => `Route "${n}" not found`,
    TEMPLATE_NOT_FOUND: (s: string) => `Template "${s}" not found`,
    TARGET_NOT_FOUND: (s: string) => `Target "${s}" not found`,
    MALFORMED_URI: (r: string) => `Malformed URI: ${r}`,
  },
} as const;

export const SYSTEM_BINDING = {
  PREFIX: '[atom-binding]',
  INPUT_DEFAULTS: Object.freeze({ EVENT: 'input', DEBOUNCE: 0 } as const),
  VALID_INPUT_TAGS: ['input', 'select', 'textarea'] as const,
  ERRORS: {
    INVALID_INPUT_ELEMENT: (t: string) => `Invalid element <${t}> for val.`,
    MISSING_SOURCE: (m: string) => `[${m}] source required.`,
    MISSING_CONDITION: (m: string) => `[${m}] condition required.`,
    UPDATER_ERROR: (d: string, s?: boolean) => `Updater failed: "${d}"${s ? ' (static)' : ''}`,
    CLEANUP_ERROR: (i?: string) => `Binding cleanup error${i ? `: ${i}` : ''}`,
    PARSE_ERROR: (d?: string) => `Parse error${d ? `: ${d}` : ''}`,
  },
} as const;

export const SYSTEM_SECURITY = {
  /**
   * Security: Sanitization Schema
   * Properties and URI patterns that are inherently dangerous and must
   * be scrubbed to prevent XSS and DOM Clobbering.
   */
  DANGEROUS_PROPS: [
    'innerHTML',
    'outerHTML',
    'srcdoc',
    '__proto__',
    'constructor',
    'prototype',
  ] as const,
  URL_PROPS: [
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
  ] as const,
  DANGEROUS_PROTOCOL_PATTERN: '(?:javascript|vbscript)',
  ERRORS: {
    UNSAFE_CONTENT: () => 'Unsafe content neutralized.',
    BLOCKED_CSS_VALUE: (p: string) => `Blocked CSS: "${p}".`,
    BLOCKED_EVENT_HANDLER: (n: string) => `Blocked handler: "${n}".`,
    BLOCKED_PROTOCOL: (n: string) => `Blocked protocol: "${n}".`,
    BLOCKED_PROP: (n: string) => `Blocked prop: "${n}".`,
  },
} as const;

export const SYSTEM_LIST = {
  PREFIX: '[atom-list]',
  ERRORS: {
    DUPLICATE_KEY: (k: string | number, i: number) => `Duplicate key "${k}" at index ${i}.`,
  },
} as const;

export const SYSTEM_MOUNT = {
  PREFIX: '[atom-mount]',
  ERRORS: {
    ERROR: (n?: string) => `Mount error${n ? ` in <${n}>` : ''}`,
    CLEANUP_ERROR: (n?: string) => `Cleanup error${n ? ` in <${n}>` : ''}`,
  },
} as const;

export const SYSTEM_DEBUG = {
  DEFAULTS: Object.freeze({ HIGHLIGHT_DURATION_MS: 500 } as const),
} as const;

/**
 * Logic: Backward Compatibility
 * Proxies for backward compatibility. These ensure that existing code
 * continues to work while the project transitions from the old flat
 * structure to the new subsystem-based organization.
 *
 * Reason: Migration
 * Allows for non-breaking internal refactoring of constant storage.
 *
 * @internal
 */

export const LOG_PREFIXES = {
  ROUTE: SYSTEM_ROUTE.PREFIX,
  BINDING: SYSTEM_BINDING.PREFIX,
  LIST: SYSTEM_LIST.PREFIX,
  MOUNT: SYSTEM_MOUNT.PREFIX,
} as const;

export const ERROR_MESSAGES = {
  ROUTE: SYSTEM_ROUTE.ERRORS,
  SECURITY: SYSTEM_SECURITY.ERRORS,
  BINDING: SYSTEM_BINDING.ERRORS,
  LIST: SYSTEM_LIST.ERRORS,
  MOUNT: SYSTEM_MOUNT.ERRORS,
  CORE: SYSTEM_CORE.ERRORS,
} as const;

export const ROUTE_DEFAULTS = SYSTEM_ROUTE.DEFAULTS;
export const INPUT_DEFAULTS = SYSTEM_BINDING.INPUT_DEFAULTS;
export const DEBUG_DEFAULTS = SYSTEM_DEBUG.DEFAULTS;

// Simplified collections (formerly Sets, now Arrays)
export const VALID_INPUT_TAGS = SYSTEM_BINDING.VALID_INPUT_TAGS;
export const URL_PROPS = SYSTEM_SECURITY.URL_PROPS;
export const DANGEROUS_PROPS = SYSTEM_SECURITY.DANGEROUS_PROPS;
export const DANGEROUS_PROTOCOL_PATTERN = SYSTEM_SECURITY.DANGEROUS_PROTOCOL_PATTERN;
