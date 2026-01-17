import type { ReactiveValue, ReadonlyAtom, ComputedAtom } from './types';

/**
 * Checks if a given value is a reactive object (Atom or Computed).
 * A reactive object is expected to have a 'value' property and a 'subscribe' method.
 * 
 * @param value - The value to check.
 * @returns True if the value is reactive, false otherwise.
 */
export function isReactive(value: unknown): value is ReadonlyAtom<unknown> | ComputedAtom<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'value' in value &&
    'subscribe' in value
  );
}

/**
 * Extracts the underlying raw value from a ReactiveValue.
 * If the source is reactive, it returns its current value; otherwise, it returns the source itself.
 * 
 * @template T - The type of the value.
 * @param source - The reactive value or raw value to extract from.
 * @returns The extracted raw value.
 */
export function getValue<T>(source: ReactiveValue<T>): T {
  if (isReactive(source)) {
    return (source as ReadonlyAtom<T>).value;
  }
  return source as T;
}

/**
 * Generates a CSS selector string for a DOM element.
 * Accepts both raw Element and JQuery objects for flexibility.
 * This is primarily used for debugging and logging purposes to identify elements.
 * 
 * @param el - The DOM element or JQuery object to generate a selector for.
 * @returns A string representing the element's ID, classes, or tag name.
 */
export function getSelector(el: Element | JQuery): string {
  // Handle JQuery objects by extracting the first DOM element
  const domEl = (el as JQuery).jquery ? (el as JQuery)[0] : el as Element;
  if (!domEl) return 'unknown';
  
  if (domEl.id) return `#${domEl.id}`;
  if (domEl.className) {
    const classes = String(domEl.className).split(/\s+/).filter(Boolean).join('.');
    return classes ? `${domEl.tagName.toLowerCase()}.${classes}` : domEl.tagName.toLowerCase();
  }
  return domEl.tagName.toLowerCase();
}
