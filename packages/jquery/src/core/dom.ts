export const SHARED_PARSER = new DOMParser();

export function atomEachElement(jq: JQuery, fn: (el: HTMLElement) => void): JQuery {
  for (let i = 0, len = jq.length; i < len; i++) {
    const node = jq[i];

    if (node?.nodeType === 1) {
      fn(node as HTMLElement);
    }
  }
  return jq;
}

export function unpack<T, O>(val: T | [T, O]): [T, O?] {
  if (!Array.isArray(val) || val.length !== 2) return [val as T];

  const second = val[1];

  const isTuple =
    typeof second === 'function' ||
    (second !== null && typeof second === 'object' && !('value' in second) && !('then' in second));

  return isTuple ? (val as [T, O]) : [val as T];
}
