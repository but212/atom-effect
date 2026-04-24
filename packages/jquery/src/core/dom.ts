/**
 * Iterates over a jQuery collection and executes a callback for each HTMLElement.
 *
 * Reason: jQuery collections can contain non-element nodes (e.g., text or
 * comment nodes). This utility provides a safe, element-only iteration path
 * required for establishing reactive bindings and event listeners.
 *
 * @param jq - The jQuery collection to iterate over.
 * @param fn - The callback function to execute for each element.
 * @returns The original jQuery collection for chaining.
 * @internal
 */
export function atomEachElement(jq: JQuery, fn: (el: HTMLElement) => void): JQuery {
  for (let i = 0, len = jq.length; i < len; i++) {
    const node = jq[i];

    // Logic: Filter for ELEMENT_NODE (type 1) to ensure the callback only receives HTMLElements.
    if (node?.nodeType === 1) {
      fn(node as HTMLElement);
    }
  }
  return jq;
}

/**
 * Normalizes a binding source into a tuple containing the source and optional configuration.
 *
 * Logic: This utility uses heuristics to determine if an input represents a
 * configuration tuple (e.g., `[source, options]`) or a simple array-based
 * data value. This is used in unified bindings to support overloaded signatures.
 *
 * @param val - The value or tuple to unpack.
 * @returns A tuple where the first element is the source and the second is optional config.
 * @internal
 */
export function unpack<T, O>(val: T | [T, O]): [T, O?] {
  if (!Array.isArray(val) || val.length !== 2) {
    return [val as T];
  }

  const second = val[1];

  // Logic: Configuration tuples typically contain a transformation function or a
  // static options object. To avoid misidentifying array-based state values as
  // options, we explicitly verify that the second element is not a reactive
  // atom (possessing a 'value' property) or a promise (possessing a 'then' method).
  const isTuple =
    typeof second === 'function' ||
    (second !== null && typeof second === 'object' && !('value' in second) && !('then' in second));

  return isTuple ? (val as [T, O]) : [val as T];
}
