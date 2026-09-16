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

export { isPromise } from '@but212/atom-effect';

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
export function getSelector(element: Element): string {
  const tag = element.localName;
  const id = element.id;
  const classNameAttribute = element.getAttribute('class');
  const type = (element as HTMLInputElement).type;

  let selectorResult = tag;
  if (id) {
    selectorResult += `#${id}`;
  }

  if (classNameAttribute) {
    const trimmed = classNameAttribute.trim().replace(/\s+/g, '.');
    if (trimmed) {
      selectorResult += `.${trimmed}`;
    }
  }

  if (type && type !== 'text') {
    selectorResult += `.${type}`;
  }

  return selectorResult;
}

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
export function flattenToFormData(formData: FormData, prefix: string, sourceObject: unknown): void {
  if (
    typeof sourceObject === 'object' &&
    sourceObject !== null &&
    !(sourceObject instanceof File) &&
    !(sourceObject instanceof Blob)
  ) {
    for (const [entryKey, entryValue] of Object.entries(sourceObject)) {
      const key = prefix ? `${prefix}[${entryKey}]` : entryKey;
      flattenToFormData(formData, key, entryValue);
    }
  } else {
    formData.append(
      prefix,
      sourceObject instanceof Blob ? sourceObject : String(sourceObject ?? '')
    );
  }
}

/**
 * Logic: Path Normalization
 * Normalizes an HTML field name (e.g., 'user[profile][name]') into a
 * dot-separated path (e.g., 'user.profile.name') compatible with lens-based
 * state access.
 *
 * @param name The field name to normalize.
 * @returns A dot-separated path string.
 *
 * @internal
 */
export function normalizePath(name: string): string {
  return name.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '');
}
