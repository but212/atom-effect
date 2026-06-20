/**
 * @module AEJConstants
 *
 * Centralized repository for library-wide defaults and error templates.
 */

/** Core reactive engine error templates. @internal */
export const SYSTEM_CORE = {
  ERRORS: {
    EFFECT_DISPOSE_ERROR: (identifier?: string) =>
      identifier ? `Dispose error: ${identifier}` : 'Dispose error',
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
    NOT_FOUND: (routeName: string) => `Route "${routeName}" not found`,
  },
} as const;

/** Reactive DOM binding configuration and error templates. @internal */
export const SYSTEM_BINDING = {
  PREFIX: '[atom-binding]',
  INPUT_DEFAULTS: { event: 'input change', debounce: 0 },
  VALID_INPUT_TAGS: ['input', 'select', 'textarea'],
  ERRORS: {
    INVALID_INPUT_ELEMENT: (tagName: string) => `Invalid element <${tagName}> for val.`,
    MISSING_SOURCE: (bindingName: string) => `[${bindingName}] source required.`,
    MISSING_CONDITION: (bindingName: string) => `[${bindingName}] condition required.`,
    UPDATER_ERROR: (bindingType: string, isStatic?: boolean) =>
      `Updater failed: "${bindingType}"${isStatic ? ' (static)' : ''}`,
    CLEANUP_ERROR: (identifier?: string) =>
      identifier ? `Binding cleanup error: ${identifier}` : 'Binding cleanup error',
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
    BLOCKED_EVENT_HANDLER: (name: string) => `Blocked handler: "${name}".`,
    BLOCKED_PROTOCOL: (name: string) => `Blocked protocol: "${name}".`,
    BLOCKED_PROP: (name: string) => `Blocked prop: "${name}".`,
  },
} as const;

/** Collection rendering diagnostic templates. @internal */
export const SYSTEM_LIST = {
  PREFIX: '[atom-list]',
  ERRORS: {
    DUPLICATE_KEY: (itemKey: string | number, i: number) =>
      `Duplicate key "${itemKey}" at index ${i}.`,
  },
} as const;

/** Component lifecycle diagnostic templates. @internal */
export const SYSTEM_MOUNT = {
  PREFIX: '[atom-mount]',
  ERRORS: {
    CLEANUP_ERROR: (identifier?: string) =>
      identifier ? `Cleanup error in <${identifier}>` : 'Cleanup error',
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
