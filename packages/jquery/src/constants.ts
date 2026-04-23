/**
 * Centralized repository for library-wide constants, defaults, and error templates.
 *
 * Logic: Subsystem Organization
 * Consolidates global prefixes, defaults, and error templates into logical
 * namespaces. This organization ensures consistency across the library and
 * provides a central location for modifying system behavior.
 *
 * @internal
 */

/** Constants for the core reactive engine. @internal */
export const SYSTEM_CORE = {
  ERRORS: {
    EFFECT_DISPOSE_ERROR: (i?: string) => `Dispose error${i ? `: ${i}` : ''}`,
  },
} as const;

/** Configuration and error templates for the routing subsystem. @internal */
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

/** Configuration and error templates for reactive bindings. @internal */
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

/**
 * Constants for the security and sanitization engine.
 *
 * Logic: Sanitization Schema
 * Defines the properties and URI protocols considered inherently dangerous.
 * These constants form the basis of the library's XSS and DOM Clobbering
 * prevention strategy.
 *
 * @internal
 */
export const SYSTEM_SECURITY = {
  /** Property names that are blocked to prevent XSS and property hijacking. */
  DANGEROUS_PROPS: [
    'innerHTML',
    'outerHTML',
    'srcdoc',
    '__proto__',
    'constructor',
    'prototype',
  ] as const,
  /** Attributes that must be validated for dangerous URI protocols. */
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
  /** Pattern for identifying malicious URI protocols. */
  DANGEROUS_PROTOCOL_PATTERN: '(?:javascript|vbscript)',
  ERRORS: {
    UNSAFE_CONTENT: () => 'Unsafe content neutralized.',
    BLOCKED_CSS_VALUE: (p: string) => `Blocked CSS: "${p}".`,
    BLOCKED_EVENT_HANDLER: (n: string) => `Blocked handler: "${n}".`,
    BLOCKED_PROTOCOL: (n: string) => `Blocked protocol: "${n}".`,
    BLOCKED_PROP: (n: string) => `Blocked prop: "${n}".`,
  },
} as const;

/** Error templates for list rendering. @internal */
export const SYSTEM_LIST = {
  PREFIX: '[atom-list]',
  ERRORS: {
    DUPLICATE_KEY: (k: string | number, i: number) => `Duplicate key "${k}" at index ${i}.`,
  },
} as const;

/** Error templates for component mounting. @internal */
export const SYSTEM_MOUNT = {
  PREFIX: '[atom-mount]',
  ERRORS: {
    ERROR: (n?: string) => `Mount error${n ? ` in <${n}>` : ''}`,
    CLEANUP_ERROR: (n?: string) => `Cleanup error${n ? ` in <${n}>` : ''}`,
  },
} as const;

/** Error templates for Web Components. @internal */
export const SYSTEM_COMPONENT = {
  PREFIX: '[atom-component]',
  ERRORS: {
    NOT_REGISTERED: (tagName: string) => `Custom Element <${tagName}> is not registered.`,
  },
} as const;

/** Defaults for the visual debug system. @internal */
export const SYSTEM_DEBUG = {
  DEFAULTS: Object.freeze({ HIGHLIGHT_DURATION_MS: 500 } as const),
} as const;
