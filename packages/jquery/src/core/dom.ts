/**
 * Reason: jQuery collections can contain text or comment nodes. This utility
 * provides a safe, element-only iteration path required for setting up
 * reactive bindings and event listeners.
 *
 * @internal
 */
export function atomEachElement(jq: JQuery, fn: (el: HTMLElement) => void): JQuery {
  for (let i = 0, len = jq.length; i < len; i++) {
    const node = jq[i];

    if (node?.nodeType === 1) {
      fn(node as HTMLElement);
    }
  }
  return jq;
}

/**
 * Logic:
 * Uses heuristics to determine if an input array represents a configuration
 * tuple or just an array-based data value.
 *
 * @internal
 */
export function unpack<T, O>(val: T | [T, O]): [T, O?] {
  if (!Array.isArray(val) || val.length !== 2) return [val as T];

  const second = val[1];

  // Logic: Tuples usually contain a formatter function or a static options object.
  // We explicitly verify that the second element isn't itself a reactive 'atom'
  // or 'promise' to avoid misidentifying array-based state values as options.
  const isTuple =
    typeof second === 'function' ||
    (second !== null && typeof second === 'object' && !('value' in second) && !('then' in second));

  return isTuple ? (val as [T, O]) : [val as T];
}
