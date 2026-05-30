/**
 * @module AEJConstants
 *
 * Responsibility:
 * Provides a centralized repository for library-wide defaults, configuration schemas,
 * and error message templates.
 *
 * Design Intent:
 * Consolidates all "magic values" and system-wide settings to ensure consistency
 * across subsystems and simplify global behavior modifications.
 */

import type { RouteConfig, ValOptions } from './types';

/** Role: Error templates for the reactive core engine. @internal */
export const SYSTEM_CORE = {
  ERRORS: {
    EFFECT_DISPOSE_ERROR: (i?: string) => `Dispose error${i ? `: ${i}` : ''}`,
  },
} as const;

/**
 * Role: Configuration and error templates for the routing subsystem.
 *
 * Logic: Immutable Defaults
 * Uses `Object.freeze` to ensure system defaults cannot be mutated at runtime,
 * maintaining a predictable routing baseline.
 *
 * @internal
 */
export const SYSTEM_ROUTE = {
  PREFIX: '[atom-route]',
  DEFAULTS: Object.freeze({
    mode: 'hash',
    basePath: '',
    autoBindLinks: false,
    activeClass: 'active',
  } as const) satisfies Partial<RouteConfig>,
  ERRORS: {
    NOT_FOUND: (n: string) => `Route "${n}" not found`,
  },
} as const;

/**
 * Role: Configuration for reactive DOM bindings.
 *
 * Constraint: Input Validation
 * `VALID_INPUT_TAGS` defines the subset of HTML elements compatible with
 * two-way data binding (`val()` logic).
 *
 * @internal
 */
export const SYSTEM_BINDING = {
  PREFIX: '[atom-binding]',
  INPUT_DEFAULTS: Object.freeze({ event: 'input change', debounce: 0 } as const) satisfies Partial<
    ValOptions<unknown>
  >,
  VALID_INPUT_TAGS: ['input', 'select', 'textarea'] as const,
  ERRORS: {
    INVALID_INPUT_ELEMENT: (t: string) => `Invalid element <${t}> for val.`,
    MISSING_SOURCE: (m: string) => `[${m}] source required.`,
    MISSING_CONDITION: (m: string) => `[${m}] condition required.`,
    UPDATER_ERROR: (d: string, s?: boolean) => `Updater failed: "${d}"${s ? ' (static)' : ''}`,
    CLEANUP_ERROR: (i?: string) => `Binding cleanup error${i ? `: ${i}` : ''}`,
  },
} as const;

/**
 * Role: Security and Sanitization Policy
 *
 * Logic: Sanitization Schema
 * This configuration defines the library's defense-in-depth strategy against
 * XSS and DOM Clobbering.
 *
 * @internal
 */
export const SYSTEM_SECURITY = {
  /**
   * Security: Blocked Properties
   * These properties are restricted to prevent direct HTML injection (XSS)
   * and Prototype Pollution attacks.
   */
  DANGEROUS_PROPS: [
    'innerHTML',
    'outerHTML',
    'srcdoc',
    '__proto__',
    'constructor',
    'prototype',
  ] as const satisfies readonly string[],
  /**
   * Security: URI Validation Vectors
   * Attributes that are frequently exploited for script execution via
   * malicious URI protocols (e.g., `javascript:`).
   */
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
  ] as const satisfies readonly string[],
  /** Security: Targets common script-capable protocols in URI strings. */
  DANGEROUS_PROTOCOL_PATTERN: '(?:javascript|vbscript)',
  ERRORS: {
    BLOCKED_EVENT_HANDLER: (n: string) => `Blocked handler: "${n}".`,
    BLOCKED_PROTOCOL: (n: string) => `Blocked protocol: "${n}".`,
    BLOCKED_PROP: (n: string) => `Blocked prop: "${n}".`,
  },
} as const;

/** Role: Diagnostics for collection rendering. @internal */
export const SYSTEM_LIST = {
  PREFIX: '[atom-list]',
  ERRORS: {
    DUPLICATE_KEY: (k: string | number, i: number) => `Duplicate key "${k}" at index ${i}.`,
  },
} as const;

/** Role: Diagnostics for dynamic component lifecycles. @internal */
export const SYSTEM_MOUNT = {
  PREFIX: '[atom-mount]',
  ERRORS: {
    CLEANUP_ERROR: (n?: string) => `Cleanup error${n ? ` in <${n}>` : ''}`,
  },
} as const;

/**
 * Role: Configuration for JQuery-native Web Component patterns.
 *
 * Why: `BIND` and `PART` attributes allow declarative binding within
 * Shadow DOM or standard templates.
 *
 * @internal
 */
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

/** Role: Tuning parameters for the visual instrumentation hub. @internal */
export const SYSTEM_DEBUG = {
  DEFAULTS: {
    HIGHLIGHT_DURATION_MS: 500,
  },
} as const;
