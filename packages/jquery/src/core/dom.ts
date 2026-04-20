/**
 * Iterates through a jQuery collection and executes the callback only for
 * valid HTMLElement (nodeType 1) nodes.
 *
 * Why: jQuery collections can contain text or comment nodes; this utility
 * provides a safe, element-only iteration path for binding setup.
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
 * Normalizes binding arguments that can be either a single reactive value or a
 * [Value, Option] tuple (e.g., .atomCss('prop', [atom, 'px'])).
 *
 * Logic:
 * Uses heuristics (checking for functions or non-atom objects) to determine if
 * the input array represents a configuration tuple or just an array-based data value.
 */
export function unpack<T, O>(val: T | [T, O]): [T, O?] {
  if (!Array.isArray(val) || val.length !== 2) return [val as T];

  const second = val[1];

  // Logic: Tuples usually contain a formatter function or a static options object.
  // We explicitly check that the second element isn't itself a reactive 'atom' or 'promise'.
  const isTuple =
    typeof second === 'function' ||
    (second !== null && typeof second === 'object' && !('value' in second) && !('then' in second));

  return isTuple ? (val as [T, O]) : [val as T];
}
