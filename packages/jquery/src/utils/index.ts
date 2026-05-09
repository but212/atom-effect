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

/**
 * Normalizes an HTML field name (e.g., 'user[profile][name]') into a
 * dot-separated path (e.g., 'user.profile.name') compatible with lenses.
 *
 * @param name - The field name to normalize.
 * @returns A dot-separated path string.
 *
 * @internal
 */
export function normalizePath(name: string): string {
  return name.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '');
}
