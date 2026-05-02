import { Option } from '@but212/atom-effect-utils';

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
    Option.map(Option.fromNullable(jq[i]), (node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        fn(node as HTMLElement);
      }
    });
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

  return Option.unwrapOr(
    Option.map(Option.fromNullable(val[1]), (second) => {
      const isTuple =
        typeof second === 'function' ||
        (second !== null &&
          typeof second === 'object' &&
          !('value' in second) &&
          !('then' in second));
      return isTuple ? (val as [T, O]) : ([val as T] as [T, O?]);
    }),
    [val as T]
  );
}
