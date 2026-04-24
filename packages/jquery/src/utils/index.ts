import type { RouteDefinition } from '@/types';

/**
 * Determines if a value is a Promise or a thenable object.
 *
 * Logic: Duck-Typing
 * Uses a standard thenable check to identify asynchronous objects across
 * different implementation libraries.
 *
 * @internal
 */
export const isPromise = <T>(v: unknown): v is Promise<T> =>
  v !== null &&
  (typeof v === 'object' || typeof v === 'function') &&
  typeof (v as PromiseLike<T>).then === 'function';

/**
 * Generates a concise, human-readable CSS selector for a DOM element.
 *
 * Logic: Element Signature
 * Prioritizes tag names, IDs, and class lists to create a reference string
 * for debugging and diagnostic logging.
 *
 * Caution: SVG Compatibility
 * SVG elements use `SVGAnimatedString` for the `className` property. This
 * method detects and unpacks `baseVal` to ensure consistent selector
 * generation across HTML and SVG namespaces.
 *
 * @internal
 */
export function getSelector(el: Element): string {
  const { localName: tag, id, className } = el;
  let res = tag;
  if (id) {
    res += `#${id}`;
  }

  const classStr =
    typeof className === 'string'
      ? className
      : (className as unknown as SVGAnimatedString)?.baseVal;

  if (classStr) {
    const trimmed = classStr.trim().replace(/\s+/g, '.');
    if (trimmed) {
      res += `.${trimmed}`;
    }
  }

  const type = (el as { type?: string }).type;
  if (type && type !== 'text') {
    res += `.${type}`;
  }

  return res;
}

/**
 * Shorthand for Object.prototype.hasOwnProperty.
 *
 * Reason: Environment Compatibility
 * Targets ES2021 environments where `Object.hasOwn` may not be available.
 * This satisfies static analysis and linting without requiring heavy polyfills.
 *
 * @internal
 */
export const hasOwn = Object.prototype.hasOwnProperty;

/**
 * Determines if a route is defined by a template selector.
 * @internal
 */
export const isTemplateRoute = (r: RouteDefinition): boolean =>
  r !== null && typeof r === 'object' && typeof r.template === 'string';

/**
 * Determines if a route is defined by a custom render function.
 * @internal
 */
export const isRenderRoute = (r: RouteDefinition): boolean =>
  r !== null && typeof r === 'object' && typeof r.render === 'function';

/**
 * Performs a shallow equality comparison between two values.
 *
 * Logic: Strict Comparison
 * Uses `Object.is` for value comparisons to correctly handle `NaN` equality
 * and signed zero distinctions (`+0` vs `-0`).
 *
 * Optimization: Performance
 * Implements early exits for identity matches and key length mismatches
 * to minimize iteration overhead in hot paths like reactive diffing.
 *
 * @internal
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  if (keysA.length !== Object.keys(objB).length) {
    return false;
  }

  for (const key of keysA) {
    if (!hasOwn.call(objB, key) || !Object.is(objA[key], objB[key])) {
      return false;
    }
  }
  return true;
}

/**
 * Recursively flattens an object into a FormData instance.
 *
 * Logic: Nested Naming
 * Converts nested structures into bracket-notation strings (e.g., 'user[profile][name]')
 * to ensure compatibility with standard form parsers in most backend frameworks.
 *
 * @param fd - The FormData instance to populate.
 * @param prefix - The name prefix for the current path.
 * @param obj - The value to flatten.
 *
 * @internal
 */
export function flattenToFormData(fd: FormData, prefix: string, obj: unknown): void {
  if (typeof obj === 'object' && obj !== null && !(obj instanceof File) && !(obj instanceof Blob)) {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}[${k}]` : k;
      flattenToFormData(fd, key, v);
    }
  } else {
    fd.append(prefix, obj instanceof Blob ? obj : String(obj ?? ''));
  }
}
