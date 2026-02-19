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
 * Any change to the relevant RouteConfig fields will surface here at compile time.
 */
type RouteDefaults = Readonly<
  Required<Pick<RouteConfig, 'mode' | 'basePath' | 'autoBindLinks' | 'activeClass'>>
>;

/**
 * Default values for RouteConfig optional fields.
 * `Object.freeze` provides runtime immutability; the `RouteDefaults` annotation
 * ensures structural compatibility with RouteConfig is verified at compile time.
 */
export const ROUTE_DEFAULTS: RouteDefaults = Object.freeze({
  mode: 'hash',
  basePath: '',
  autoBindLinks: false,
  activeClass: 'active',
});

// ============================================================================
// Input Defaults
// ============================================================================

/**
 * Default values for input binding options.
 * DEBOUNCE is intentionally omitted: 0 is self-documenting at the call site
 * (`options.debounce ?? 0`) and extracting it as a named constant adds
 * indirection without clarity.
 * Additional defaults may be added here as the input binding API grows.
 */
export const INPUT_DEFAULTS = {
  EVENT: 'input',
} as const;

// ============================================================================
// Dangerous DOM Properties
// ============================================================================

/**
 * Input element tag names accepted by `bindVal`.
 * Stored as a Set for O(1) lookup — consistent with the DANGEROUS_PROPS pattern.
 */
export const VALID_INPUT_TAGS: ReadonlySet<string> = new Set(['input', 'select', 'textarea']);

/**
 * DOM properties blocked by `bindProp` to prevent HTML injection and
 * prototype pollution attacks.
 *
 * Stored as a `ReadonlySet` for O(1) lookup and runtime immutability.
 * `as const` alone does not freeze objects at runtime.
 *
 * Blocked categories:
 * - Raw HTML sinks  : innerHTML, outerHTML, srcdoc
 * - Prototype access: __proto__, constructor, prototype
 *
 * Note: `src` is intentionally NOT blocked here. `bindProp` targets DOM
 * properties on arbitrary elements; blocking `src` would prevent legitimate
 * use on `<img>`, `<audio>`, `<video>`, etc. URL-bearing *attributes* (including
 * `src` on `<script>`/`<iframe>`) are guarded separately by `bindAttr` via
 * `isDangerousUrl()` in utils.ts.
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
// Error Messages
// ============================================================================

/**
 * Canonical error and warning messages for all subsystems.
 *
 * Every entry is a zero-or-one-argument function so consumers call them
 * uniformly — `ERROR_MESSAGES.X(arg)` — with no special-casing for
 * parameter-free messages. The `as const` here makes the function references
 * themselves readonly (non-reassignable); it does not narrow the string
 * return types.
 */
export const ERROR_MESSAGES = {
  ROUTE_NOT_FOUND: (name: string) => `Route "${name}" not found and no notFound route configured`,
  TEMPLATE_NOT_FOUND: (selector: string) => `Template "${selector}" not found`,
  TARGET_NOT_FOUND: (selector: string) => `Target element "${selector}" not found`,
  MALFORMED_URI: (raw: string) => `Malformed URI component: ${raw}`,
  /** Emitted when sanitizeHtml modifies the input. Prefixed at call site with LOG_PREFIXES.BINDING or LIST to identify the originating subsystem. */
  UNSAFE_CONTENT: () => 'Unsafe content neutralized during sanitization.',
  /** Emitted by bindCss when a CSS style property value contains a dangerous protocol. */
  BLOCKED_DANGEROUS_CSS_VALUE: (prop: string) =>
    `Blocked dangerous value in CSS style property "${prop}".`,
  BLOCKED_EVENT_HANDLER: (name: string) =>
    `Blocked setting dangerous event handler attribute "${name}".`,
  BLOCKED_PROTOCOL: (name: string) => `Blocked dangerous protocol in "${name}" attribute.`,
  BLOCKED_DANGEROUS_PROP: (name: string) =>
    `Blocked setting dangerous property "${name}". Use html binding for sanitized HTML.`,
  INVALID_INPUT_ELEMENT: (tagName: string) => `Val binding used on non-input element <${tagName}>.`,
  MISSING_SOURCE: (method: string) => `[${method}] source is required when prop/name is a string.`,
  MISSING_CONDITION: (method: string) =>
    `[${method}] condition is required when className is a string.`,
  DUPLICATE_KEY: (key: string | number, index: number) =>
    `Duplicate key "${key}" at index ${index}.`,
  UPDATER_ERROR: (debugType: string) => `Updater threw in binding "${debugType}"`,
  EFFECT_DISPOSE_ERROR: () => 'Effect dispose error',
  BINDING_CLEANUP_ERROR: () => 'Binding cleanup error',
  PARSE_ERROR: () => 'parse() threw during DOM→Atom sync',
  MOUNT_ERROR: () => 'Mount error',
  MOUNT_CLEANUP_ERROR: () => 'Cleanup error',
} as const;
