import type { ReadonlyAtom } from '@but212/atom-effect';
import { isAtom } from '@but212/atom-effect';
import type { RenderRoute, RouteDefinition, TemplateRoute } from '@/types';

// ============================================================================
// Reactive helpers
// ============================================================================

/**
 * Checks if a given value is a reactive node (Atom or Computed).
 *
 * `isAtom` returns `true` for both plain atoms and computed atoms because
 * `ComputedAtomImpl` carries `ATOM_BRAND` in addition to `COMPUTED_BRAND`.
 * A separate `isComputed` check would therefore be redundant.
 */
export function isReactive(value: unknown): value is ReadonlyAtom<unknown> {
  return isAtom(value);
}

/**
 * Checks if a value is a Promise (thenable).
 */
export function isPromise<T>(value: unknown): value is Promise<T> {
  return !!value && typeof (value as Promise<T>).then === 'function';
}

// ============================================================================
// DOM helpers
// ============================================================================

/**
 * Generates a CSS selector-like string for a DOM element, suitable for debug
 * output. Returns `tagName#id` when an id is present, otherwise
 * `tagName.class1.class2…`.
 *
 * ⚠ Not a valid CSS selector — do NOT pass this to `querySelector()`.
 * Element IDs and class names may contain characters with special meaning in
 * CSS selectors (e.g. `.`, `[`, `(`). This helper is intended solely for
 * human-readable console/log messages.
 */
export function getSelector(el: Element): string {
  const tagName = el.tagName.toLowerCase();
  if (el.id) return `${tagName}#${el.id}`;

  const list = el.classList;
  const len = list.length;
  if (len === 0) return tagName;

  let selector = tagName;
  for (let i = 0; i < len; i++) {
    selector += `.${list[i]!}`;
  }
  return selector;
}

// ============================================================================
// Shared low-level helpers
// ============================================================================

/** Portable own-property check. Prefer over `in` to exclude prototype keys. */
export const hasOwn = Object.prototype.hasOwnProperty;

// ============================================================================
// Route type guards
// ============================================================================

/** Narrows a `RouteDefinition` to `TemplateRoute`. */
export function isTemplateRoute(r: RouteDefinition): r is TemplateRoute {
  return typeof (r as TemplateRoute).template === 'string';
}

/** Narrows a `RouteDefinition` to `RenderRoute`. */
export function isRenderRoute(r: RouteDefinition): r is RenderRoute {
  return typeof (r as RenderRoute).render === 'function';
}

// ============================================================================
// General utilities
// ============================================================================

/**
 * Shallow equality check for plain objects.
 * Returns `true` if both objects have the same own keys with identical (`===`) values.
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;

  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i]!;
    if (!hasOwn.call(objB, key) || objA[key] !== objB[key]) {
      return false;
    }
  }
  return true;
}
