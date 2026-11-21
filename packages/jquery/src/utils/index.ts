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
export function formNameToPath(name: string): string {
  return name.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '');
}

const nodeTypeGetter = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeType')?.get as
  | ((this: Node) => number)
  | undefined;

/** Reads the native node type even when an element shadows the instance property. @internal */
export function getNodeType(node: Node): number {
  try {
    return nodeTypeGetter ? nodeTypeGetter.call(node) : node.nodeType;
  } catch {
    return -1;
  }
}

/**
 * Element-only iteration for jQuery collections.
 * @internal
 */
export function atomEachElement(
  jqueryCollection: JQuery,
  callback: (element: HTMLElement) => void
): JQuery {
  for (let i = 0, len = jqueryCollection.length; i < len; i++) {
    const node = jqueryCollection[i];
    if (node && getNodeType(node) === Node.ELEMENT_NODE) callback(node as HTMLElement);
  }
  return jqueryCollection;
}
