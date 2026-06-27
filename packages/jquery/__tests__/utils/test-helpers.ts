import $ from 'jquery';
import { afterEach, vi } from 'vitest';

/**
 * Safely wraps a Promise as a JQuery.jqXHR object for testing.
 * This encapsulates the JQuery.jqXHR type casting.
 *
 * @param promise The promise representing the asynchronous execution.
 * @param extraProps Optional properties (like `abort` functions or metadata) to assign to the object.
 */
export function createMockJqXHR<T>(
  promise: Promise<T>,
  extraProps?: Partial<JQuery.jqXHR>
): JQuery.jqXHR {
  return castTo<JQuery.jqXHR>(Object.assign(promise, extraProps));
}

/**
 * Casts a value to a target type to bypass typescript compiler checks in tests.
 * This avoids inline `as unknown as TargetType` patterns.
 *
 * @param value The value to cast.
 */
export function castTo<T>(value: unknown): T {
  return value as T;
}

/**
 * Set up automatic DOM node cleanup and mock restoration for tests.
 * Returns an `appendToBody` function to register elements.
 */
export function setupDOMCleanup(): {
  appendToBody: (htmlOrEl: string | JQuery | Element) => JQuery;
} {
  const activeElements: JQuery[] = [];

  function appendToBody(htmlOrEl: string | JQuery | Element): JQuery {
    if (htmlOrEl instanceof $) {
      const $element = htmlOrEl as JQuery;
      $element.appendTo(document.body);
      activeElements.push($element);
      return $element;
    }
    const $element = (
      typeof htmlOrEl === 'string' ? $(htmlOrEl) : $(htmlOrEl as Element)
    ) as JQuery;
    $element.appendTo(document.body);
    activeElements.push($element);
    return $element;
  }

  afterEach(() => {
    for (const $element of activeElements) {
      $element.remove();
    }
    activeElements.length = 0;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  return { appendToBody };
}
