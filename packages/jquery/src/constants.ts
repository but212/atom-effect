/**
 * @module AEJConstants
 *
 * Centralized repository for library-wide defaults and error templates.
 */

/** Core reactive engine error templates. @internal */
export const SYSTEM_CORE = {
  ERRORS: {
    EFFECT_DISPOSE_ERROR: (i?: string) => (i ? `Dispose error: ${i}` : 'Dispose error'),
  },
} as const;

/** Routing configuration and error templates. @internal */
export const SYSTEM_ROUTE = {
  PREFIX: '[atom-route]',
  DEFAULTS: {
    mode: 'hash',
    basePath: '',
    autoBindLinks: false,
    activeClass: 'active',
  },
  ERRORS: {
    NOT_FOUND: (n: string) => `Route "${n}" not found`,
  },
} as const;

/** Reactive DOM binding configuration and error templates. @internal */
export const SYSTEM_BINDING = {
  PREFIX: '[atom-binding]',
  INPUT_DEFAULTS: { event: 'input change', debounce: 0 },
  VALID_INPUT_TAGS: ['input', 'select', 'textarea'],
  ERRORS: {
    INVALID_INPUT_ELEMENT: (t: string) => `Invalid element <${t}> for val.`,
    MISSING_SOURCE: (m: string) => `[${m}] source required.`,
    MISSING_CONDITION: (m: string) => `[${m}] condition required.`,
    UPDATER_ERROR: (d: string, s?: boolean) => `Updater failed: "${d}"${s ? ' (static)' : ''}`,
    CLEANUP_ERROR: (i?: string) => (i ? `Binding cleanup error: ${i}` : 'Binding cleanup error'),
  },
} as const;

/** Security rules, validation vectors, and error templates. @internal */
export const SYSTEM_SECURITY = {
  DANGEROUS_PROPS: ['innerHTML', 'outerHTML', 'srcdoc', '__proto__', 'constructor', 'prototype'],
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
  ],
  DANGEROUS_PROTOCOL_PATTERN: '(?:javascript|vbscript)',
  ERRORS: {
    BLOCKED_EVENT_HANDLER: (n: string) => `Blocked handler: "${n}".`,
    BLOCKED_PROTOCOL: (n: string) => `Blocked protocol: "${n}".`,
    BLOCKED_PROP: (n: string) => `Blocked prop: "${n}".`,
  },
} as const;

/** Collection rendering diagnostic templates. @internal */
export const SYSTEM_LIST = {
  PREFIX: '[atom-list]',
  ERRORS: {
    DUPLICATE_KEY: (k: string | number, i: number) => `Duplicate key "${k}" at index ${i}.`,
  },
} as const;

/** Component lifecycle diagnostic templates. @internal */
export const SYSTEM_MOUNT = {
  PREFIX: '[atom-mount]',
  ERRORS: {
    CLEANUP_ERROR: (n?: string) => (n ? `Cleanup error in <${n}>` : 'Cleanup error'),
  },
} as const;

/** Web Component patterns configuration and error templates. @internal */
export const SYSTEM_COMPONENT = {
  PREFIX: '[atom-component]',
  ATTRS: {
    BIND: 'data-aej-bind',
    PART: 'data-aej-part',
    LEGACY_BIND: 'data-bind',
  },
  ERRORS: {
    NOT_REGISTERED: (tagName: string) => `Custom Element <${tagName}> is not registered.`,
  },
} as const;

/** Visual instrumentation tuning parameters. @internal */
export const SYSTEM_DEBUG = {
  DEFAULTS: {
    HIGHLIGHT_DURATION_MS: 500,
  },
} as const;
