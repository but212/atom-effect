import type { RouteDefinition } from '@/types';

export const isPromise = <T>(v: unknown): v is Promise<T> =>
  v !== null &&
  (typeof v === 'object' || typeof v === 'function') &&
  typeof (v as PromiseLike<T>).then === 'function';

/**
 * Logic: Element Signature
 * Prioritizes tag name, `#id`, and `.classes` to create a concise reference
 * for debugging and logging purposes.
 *
 * Caution: SVG Compatibility
 * Includes specific handling for SVG elements where `className` is an
 * `SVGAnimatedString` rather than a primitive string.
 *
 * @internal
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
 * Reason: Environment Compatibility
 * The project targets ES2021, but modern linting rules often mandate
 * the use of `hasOwn`. This shim satisfies static analysis without
 * requiring an ES2022 runtime or heavy polyfills.
 *
 * @internal
 */
export const hasOwn = Object.prototype.hasOwnProperty;

export const isTemplateRoute = (r: RouteDefinition): boolean =>
  r !== null && typeof r === 'object' && typeof r.template === 'string';

/** @internal */
export const isRenderRoute = (r: RouteDefinition): boolean =>
  r !== null && typeof r === 'object' && typeof r.render === 'function';

/**
 * Logic: Equality Check
 * - Uses `Object.is` for correct comparison of `NaN` and signed zeros (`+0` vs `-0`).
 *
 * Optimization: Performance
 * - Optimized for early exit on identity matches (`a === b`) or key length mismatch.
 *
 * @internal
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
