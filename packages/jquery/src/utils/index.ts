/**
 * @module AEJUtilities
 *
 * Responsibility:
 * Provides low-level utility primitives for DOM inspection, path normalization,
 * and object serialization.
 *
 * Design Intent:
 * Provides stateless, high-performance helpers that abstract away browser
 * inconsistencies (e.g. SVG classNames) and normalize data for reactive state access.
 */

import type { RouteDefinition } from '@/types';

/**
 * Logic: Async Identification
 * Identifies thenable objects to ensure uniform handling of both native
 * Promises and third-party async primitives across different environments.
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
 * Logic: Template Type Guard
 * Determines if a route definition is configured to use a template selector.
 * @internal
 */
export const isTemplateRoute = (r: RouteDefinition): boolean =>
  r !== null && typeof r === 'object' && typeof r.template === 'string';

/**
 * Logic: Render Type Guard
 * Determines if a route definition is configured with a custom render function.
 * @internal
 */
export const isRenderRoute = (r: RouteDefinition): boolean =>
  r !== null && typeof r === 'object' && typeof r.render === 'function';

/**
 * Logic: Nested Serialization
 * Recursively flattens an object into a FormData instance using bracket notation
 * (e.g., 'user[profile][name]') for framework compatibility.
 *
 * When to use:
 * - Synchronizing complex reactive state objects with standard HTML form submissions.
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
 * Logic: Path Normalization
 * Normalizes an HTML field name (e.g., 'user[profile][name]') into a
 * dot-separated path (e.g., 'user.profile.name') compatible with lens-based
 * state access.
 *
 * @param name - The field name to normalize.
 * @returns A dot-separated path string.
 *
 * @internal
 */
export function normalizePath(name: string): string {
  return name.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '');
}
