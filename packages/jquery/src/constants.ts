/**
 * Constants for atom-effect-jquery
 */

import type { RouteConfig } from './types';

// ============================================================================
// Log Prefixes
// ============================================================================

/**
 * Log prefixes keyed by subsystem.
 * Each prefix names the specific subsystem that emitted the message so that
 * console output is unambiguous regardless of which binding triggered it.
 */
export const LOG_PREFIXES = {
  /** Used by the SPA router ($.route). */
  ROUTE: '[atom-route]',
  /** Used by all reactive binding helpers (bindText, bindCss, bindAttr, …). */
  BINDING: '[atom-binding]',
  /** Used by atomList reactive list rendering. */
  LIST: '[atom-list]',
  /** Used by mount/unmount lifecycle helpers. */
  MOUNT: '[atom-mount]',
} as const;

// ============================================================================
// Route Defaults
// ============================================================================

/**
 * Subset of RouteConfig fields that have default values.
 * Extracted as a named type so the annotation on ROUTE_DEFAULTS stays concise.
 */
type RouteDefaults = Readonly<
  Required<Pick<RouteConfig, 'mode' | 'basePath' | 'autoBindLinks' | 'activeClass'>>
>;

/**
 * Default values for RouteConfig optional fields.
 */
export const ROUTE_DEFAULTS: RouteDefaults = Object.freeze({
  mode: 'hash',
  basePath: '',
  autoBindLinks: false,
  activeClass: 'active',
});

// ============================================================================
// Input & Binding Defaults
// ============================================================================

/**
 * Default values for input binding options.
 */
export const INPUT_DEFAULTS = {
  /** Default DOM event to trigger synchronization. */
  EVENT: 'input',
  /** Default debounce delay in milliseconds. */
  DEBOUNCE: 0,
} as const;

// ============================================================================
// Security-Sensitive DOM Elements & Properties
// ============================================================================

/**
 * Valid input-like tag names for val binding.
 * Internal comparisons MUST use `.toLowerCase()` on the element's tagName.
 */
export const VALID_INPUT_TAGS: ReadonlySet<string> = new Set(['input', 'select', 'textarea']);

/**
 * DOM properties that carry URL values.
 *
 * Even when using `bindProp` (Property binding) instead of `bindAttr` (Attribute
 * binding), these properties must be guarded for dangerous protocols
 * (e.g. `javascript:`) to prevent bypasses.
 */
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
]);

/**
 * DOM properties blocked by `bindProp` to prevent HTML injection and
 * prototype pollution attacks.
 *
 * ⚠ Note: `on*` event handler properties are blocked by logic in `bindProp`,
 * not by this static list, to cover all possible event types (onclick, etc.).
 */
export const DANGEROUS_PROPS: ReadonlySet<string> = new Set([
  'innerHTML',
  'outerHTML',
  'srcdoc',
  '__proto__',
  'constructor',
  'prototype',
]);

// ============================================================================
// Error & Warning Messages
// ============================================================================

/**
 * Canonical error and warning messages for all subsystems.
 *
 * Every entry is a function providing consistent caller-side context.
 */
export const ERROR_MESSAGES = {
  ROUTE_NOT_FOUND: (name: string) => `Route "${name}" not found and no notFound route configured`,
  TEMPLATE_NOT_FOUND: (selector: string) => `Template "${selector}" not found`,
  TARGET_NOT_FOUND: (selector: string) => `Target element "${selector}" not found`,
  MALFORMED_URI: (raw: string) => `Malformed URI component: ${raw}`,
  /** Emitted when sanitizeHtml modifies the input. */
  UNSAFE_CONTENT: () => 'Unsafe content neutralized during sanitization.',
  /** Emitted when a CSS style property value contains a dangerous protocol. */
  BLOCKED_DANGEROUS_CSS_VALUE: (prop: string) =>
    `Blocked dangerous value in CSS style property "${prop}".`,
  BLOCKED_EVENT_HANDLER: (name: string) =>
    `Blocked setting dangerous event handler attribute/property "${name}".`,
  BLOCKED_PROTOCOL: (name: string) => `Blocked dangerous protocol in "${name}".`,
  BLOCKED_DANGEROUS_PROP: (name: string) =>
    `Blocked setting dangerous property "${name}". Use html binding for sanitized HTML.`,
  INVALID_INPUT_ELEMENT: (tagName: string) => `Val binding used on non-input element <${tagName}>.`,
  MISSING_SOURCE: (method: string) => `[${method}] source is required when prop/name is a string.`,
  MISSING_CONDITION: (method: string) =>
    `[${method}] condition is required when className is a string.`,
  DUPLICATE_KEY: (key: string | number, index: number) =>
    `Duplicate key "${key}" at index ${index} in atomList.`,
  UPDATER_ERROR: (debugType: string, isStatic?: boolean) =>
    `Updater threw in binding "${debugType}"${isStatic ? ' (static)' : ''}`,
  EFFECT_DISPOSE_ERROR: (info?: string) => `Effect dispose error${info ? `: ${info}` : ''}`,
  BINDING_CLEANUP_ERROR: (info?: string) => `Binding cleanup error${info ? `: ${info}` : ''}`,
  PARSE_ERROR: (details?: string) =>
    `parse() threw during DOM→Atom sync${details ? `: ${details}` : ''}`,
  MOUNT_ERROR: (name?: string) => `Mount error${name ? ` in component <${name}>` : ''}`,
  MOUNT_CLEANUP_ERROR: (name?: string) => `Cleanup error${name ? ` in component <${name}>` : ''}`,
} as const;
