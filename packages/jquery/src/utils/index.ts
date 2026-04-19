import type { RenderRoute, RouteDefinition, TemplateRoute } from '@/types';

/** Standard type guard for thenable objects (Promises). */
export const isPromise = <T>(v: unknown): v is Promise<T> =>
  v !== null &&
  (typeof v === 'object' || typeof v === 'function') &&
  typeof (v as PromiseLike<T>).then === 'function';

/**
 * Generates a human-readable CSS selector for an Element.
 *
 * Logic: Prioritizes tag, #id, and .classes.
 * Caution: Includes specific handling for SVG elements where `className`
 * is an SVGAnimatedString rather than a standard string.
 */
export function getSelector(el: Element): string {
  const { localName: tag, id, className } = el;
  let res = tag;
  if (id) res += `#${id}`;

  const classStr =
    typeof className === 'string'
      ? className
      : (className as unknown as SVGAnimatedString)?.baseVal;

  if (classStr) {
    const trimmed = classStr.trim().replace(/\s+/g, '.');
    if (trimmed) res += `.${trimmed}`;
  }

  const type = (el as { type?: string }).type;
  if (type && type !== 'text') res += `.${type}`;

  return res;
}

/**
 * Compatibility Shim: Provides a safe alternative to Object.hasOwn (ES2022).
 *
 * Reason: The project targets ES2021, but modern linting rules often
 * mandate the use of `hasOwn`. This shim satisfies static analysis
 * without requiring an ES2022 runtime.
 */
export const hasOwn = Object.prototype.hasOwnProperty;

/** Route Type Guard: Identifies routes defined via <template> selectors. */
export const isTemplateRoute = (r: RouteDefinition): r is TemplateRoute =>
  r !== null && typeof r === 'object' && 'template' in r;

/** Route Type Guard: Identifies routes defined via functional renderers. */
export const isRenderRoute = (r: RouteDefinition): r is RenderRoute =>
  r !== null && typeof r === 'object' && 'render' in r;

/**
 * Performs a shallow comparison between two objects.
 *
 * Features:
 * - Uses `Object.is` for correct NaN and signed-zero comparison.
 * - Optimized for early exit on identity or length mismatch.
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  if (keysA.length !== Object.keys(objB).length) return false;

  for (const key of keysA) {
    if (!hasOwn.call(objB, key) || !Object.is(objA[key], objB[key])) return false;
  }
  return true;
}
