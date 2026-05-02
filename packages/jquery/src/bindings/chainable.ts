import $ from 'jquery';
import { bindForm } from '@/bindings/form';
import {
  bindAttr,
  bindChecked,
  bindClass,
  bindCss,
  bindEvents,
  bindHtml,
  bindOn,
  bindProp,
  bindText,
  bindVal,
  bindVisibility,
} from '@/bindings/unified';
import { SYSTEM_BINDING } from '@/constants';
import { atomEachElement, unpack } from '@/core/dom';
import { registry } from '@/core/registry';
import type {
  AsyncReactiveValue,
  BindingOptions,
  CssBindings,
  CssValue,
  FormOptions,
  PrimitiveValue,
  ValOptions,
  WritableAtom,
} from '@/types';

import { debug } from '@/utils/debug';

/**
 * Resolves overloaded arguments (key-value pair or mapping object) into a consistent Record.
 *
 * Logic: Argument Normalization
 * Standardizes jQuery-style overloads into a uniform data structure for
 * downstream binding operations.
 *
 * @param keyOrMap - A property name string or a mapping object.
 * @param value - The reactive value (required if `keyOrMap` is a string).
 * @returns A normalized Record map, or null if invalid.
 * @internal
 */
function resolveArgs<V>(
  keyOrMap: string | Record<string, V>,
  value: V | undefined
): Record<string, V> | null {
  if (typeof keyOrMap === 'object' && keyOrMap !== null) {
    return keyOrMap;
  }
  if (typeof keyOrMap === 'string' && value !== undefined) {
    return { [keyOrMap]: value };
  }
  return null;
}

/**
 * Binds the text content of elements to a reactive source.
 *
 * When to use:
 * - To synchronize labels, counters, or status messages with an atom's value.
 * - To display formatted strings derived from reactive data.
 *
 * @param source - The reactive atom or computed value.
 * @param formatter - An optional function to transform the value into a string.
 * @returns The original jQuery collection for chaining.
 *
 * @example
 * ```typescript
 * $('.count-display').atomText(counterAtom, (val) => `Total: ${val}`);
 * ```
 */
$.fn.atomText = function <T>(source: AsyncReactiveValue<T>, formatter?: (v: T) => string): JQuery {
  return atomEachElement(this, (el) => bindText(el, source, formatter));
};

/**
 * Binds the HTML content of elements to a reactive source.
 *
 * Caution: Ensure the source data is trusted and sanitized. Rendering unsanitized
 * HTML from user input can lead to XSS vulnerabilities.
 *
 * When to use:
 * - To render complex markup or rich text that requires formatting tags.
 *
 * @param source - The reactive atom containing the HTML string.
 * @returns The original jQuery collection for chaining.
 */
$.fn.atomHtml = function (source: AsyncReactiveValue<string>): JQuery {
  return atomEachElement(this, (el) => bindHtml(el, source));
};

/**
 * Factory for creating chainable jQuery methods with unified argument resolution.
 *
 * Logic: Method HOC
 * Encapsulates argument normalization and element iteration to provide a
 * declarative interface for chainable plugin methods.
 *
 * @param binder - The underlying binding function.
 * @param errorMsg - Error message to display if arguments are invalid.
 * @internal
 */
function createChainableMethod<V>(
  binder: (el: HTMLElement, map: Record<string, V>) => void,
  errorMsg: string
) {
  return function (this: JQuery, keyOrMap: string | Record<string, V>, value?: V): JQuery {
    const map = resolveArgs(keyOrMap, value);
    if (!map) {
      console.warn(`${SYSTEM_BINDING.PREFIX} ${errorMsg}`);
      return this;
    }
    return atomEachElement(this, (el) => binder(el, map));
  };
}

/**
 * Binds CSS classes to reactive conditions.
 *
 * Logic: Class Toggling
 * Supports both toggling a single class based on a condition and managing
 * multiple classes through a mapping object.
 *
 * When to use:
 * - To toggle stateful classes (e.g., 'is-active', 'is-loading').
 * - To manage complex UI states defined by multiple simultaneous flags.
 *
 * @param classNameOrMap - A class name string or a map of `{ className: conditionAtom }`.
 * @param condition - The condition for the class (required if `classNameOrMap` is a string).
 * @returns The original jQuery collection for chaining.
 *
 * @example
 * ```typescript
 * $('.tab').atomClass('active', activeAtom);
 * ```
 */
$.fn.atomClass = createChainableMethod(
  bindClass,
  SYSTEM_BINDING.ERRORS.MISSING_CONDITION('atomClass')
);

/**
 * Binds HTML attributes to reactive sources.
 *
 * @example
 * ```typescript
 * $('.link').atomAttr('href', urlAtom);
 * ```
 */
$.fn.atomAttr = createChainableMethod(bindAttr, SYSTEM_BINDING.ERRORS.MISSING_SOURCE('atomAttr'));

/**
 * Binds DOM properties directly to reactive sources.
 *
 * @example
 * ```typescript
 * $('.input').atomProp('disabled', disabledAtom);
 * ```
 */
$.fn.atomProp = createChainableMethod(
  bindProp as (el: HTMLElement, map: Record<string, AsyncReactiveValue<unknown>>) => void,
  SYSTEM_BINDING.ERRORS.MISSING_SOURCE('atomProp')
);

/**
 * Binds inline CSS properties to reactive sources.
 *
 * Note: Specialized implementation to handle optional units.
 */
$.fn.atomCss = function (
  this: JQuery,
  propOrMap: string | CssBindings,
  source?: AsyncReactiveValue<string | number>,
  unit?: string
): JQuery {
  const value: CssValue | undefined =
    source !== undefined && unit ? [source as AsyncReactiveValue<number>, unit] : source;
  const map = resolveArgs<CssValue>(propOrMap, value);

  if (!map) {
    console.warn(`${SYSTEM_BINDING.PREFIX} ${SYSTEM_BINDING.ERRORS.MISSING_SOURCE('atomCss')}`);
    return this;
  }

  return atomEachElement(this, (el) => bindCss(el, map as CssBindings));
};

/**
 * Controls the visibility of elements based on a reactive condition.
 *
 * When to use:
 * - To show elements when a condition is met (using `display: block` or previous display value).
 *
 * @param condition - The reactive condition governing visibility.
 * @returns The original jQuery collection for chaining.
 */
$.fn.atomShow = function (condition: AsyncReactiveValue<boolean>): JQuery {
  return atomEachElement(this, (el) => bindVisibility(el, condition, false));
};

/**
 * Controls the invisibility of elements based on a reactive condition.
 *
 * When to use:
 * - To hide elements when a condition is met (using `display: none`).
 *
 * @param condition - The reactive condition governing invisibility.
 * @returns The original jQuery collection for chaining.
 */
$.fn.atomHide = function (condition: AsyncReactiveValue<boolean>): JQuery {
  return atomEachElement(this, (el) => bindVisibility(el, condition, true));
};

/**
 * Performs two-way binding for form input values.
 *
 * Logic: Synchronizes the input's `value` with a writable atom. This handles
 * both atom-to-DOM updates and DOM-to-atom changes (via `input` or `change` events).
 *
 * When to use:
 * - To manage state for text inputs, textareas, and select menus.
 *
 * @param atom - The writable atom to synchronize with the input value.
 * @param options - Configuration for debouncing or event triggers.
 * @returns The original jQuery collection for chaining.
 */
$.fn.atomVal = function <T>(atom: WritableAtom<T>, options: ValOptions<T> = {}): JQuery {
  return atomEachElement(this, (el) =>
    bindVal(el, atom as WritableAtom<unknown>, options as ValOptions<unknown>)
  );
};

/**
 * Performs two-way binding for checkbox and radio button checked states.
 *
 * @param atom - The writable atom to synchronize with the checked state.
 * @returns The original jQuery collection for chaining.
 */
$.fn.atomChecked = function (atom: WritableAtom<boolean>): JQuery {
  return atomEachElement(this, (el) => bindChecked(el, atom));
};

/**
 * Orchestrates two-way binding for an entire form element.
 *
 * Logic: Maps form fields (identified by their `name` attributes) to nested
 * properties within a reactive object atom.
 *
 * When to use:
 * - To synchronize a complex data model with a standard HTML form.
 *
 * @param atom - The writable atom containing the form's data model.
 * @param options - Configuration for validation or submission handling.
 * @returns The original jQuery collection for chaining.
 */
$.fn.atomForm = function <T extends object>(
  atom: WritableAtom<T>,
  options: FormOptions<T> = {}
): JQuery {
  return atomEachElement(this, (el) => {
    if (el instanceof HTMLFormElement) {
      bindForm(el, atom as WritableAtom<object>, options as unknown as FormOptions<unknown>);
    } else {
      debug.warn(SYSTEM_BINDING.PREFIX, 'Skipping non-Form element for atomForm');
    }
  });
};

/**
 * Binds a reactive event listener to elements.
 *
 * @param event - The name of the DOM event.
 * @param handler - The event handler function.
 * @returns The original jQuery collection for chaining.
 */
$.fn.atomOn = function (event: string, handler: (e: JQuery.Event) => void): JQuery {
  return atomEachElement(this, (el) => bindOn(el, event, handler));
};

/** @internal */
interface BindingTask {
  key: keyof BindingOptions<unknown>;
  run: (el: HTMLElement, val: unknown) => void;
}

/**
 * A registry of specialized binding tasks for the unified `.atomBind()` method.
 *
 * Optimization: The order of execution in this array ensures consistent and
 * predictable rendering results (e.g., text content is set before class toggling).
 * @internal
 */
const BINDING_TASKS: BindingTask[] = [
  {
    key: 'text',
    run: (el, v) =>
      bindText(el, ...(unpack(v) as [AsyncReactiveValue<unknown>, (v: unknown) => string])),
  },
  { key: 'html', run: (el, v) => bindHtml(el, v as AsyncReactiveValue<string>) },
  {
    key: 'class',
    run: (el, v) => bindClass(el, v as Record<string, AsyncReactiveValue<boolean>>),
  },
  { key: 'css', run: (el, v) => bindCss(el, v as CssBindings) },
  {
    key: 'attr',
    run: (el, v) => bindAttr(el, v as Record<string, AsyncReactiveValue<PrimitiveValue>>),
  },
  {
    key: 'prop',
    run: (el, v) => bindProp(el, v as Record<string, AsyncReactiveValue<unknown>>),
  },
  { key: 'show', run: (el, v) => bindVisibility(el, v as AsyncReactiveValue<boolean>, false) },
  { key: 'hide', run: (el, v) => bindVisibility(el, v as AsyncReactiveValue<boolean>, true) },
  {
    key: 'val',
    run: (el, v) => bindVal(el, ...(unpack(v) as [WritableAtom<unknown>, ValOptions<unknown>])),
  },
  { key: 'checked', run: (el, v) => bindChecked(el, v as WritableAtom<boolean>) },
  {
    key: 'form',
    run: (el, v) => {
      if (el instanceof HTMLFormElement) {
        bindForm(el, ...(unpack(v) as [WritableAtom<object>, FormOptions<unknown>]));
      }
    },
  },
  { key: 'on', run: (el, v) => bindEvents(el, v as Record<string, (e: JQuery.Event) => void>) },
];

/**
 * A unified entry point for declaring multiple reactive bindings in a single call.
 *
 * Logic: This method iterates through the provided configuration and executes
 * the corresponding binding tasks in a deterministic order.
 *
 * When to use:
 * - To initialize multiple reactive bindings on an element efficiently.
 * - To maintain organized and readable binding declarations in complex UIs.
 *
 * @param options - A configuration object defining multiple bindings.
 * @returns The original jQuery collection for chaining.
 *
 * @example
 * ```typescript
 * $('.submit-btn').atomBind({
 *   text: labelAtom,
 *   class: { 'is-loading': loadingAtom },
 *   on: { click: handleSubmit }
 * });
 * ```
 */
$.fn.atomBind = function <T>(this: JQuery, options: BindingOptions<T>): JQuery {
  const opt = options as Record<string, unknown>;

  // Check if there are any valid tasks to run.
  const activeTasks = BINDING_TASKS.filter((task) => opt[task.key] !== undefined);
  if (activeTasks.length === 0) return this;

  return atomEachElement(this, (el) => {
    activeTasks.forEach((task) => {
      task.run(el, opt[task.key]);
    });
  });
};

/**
 * Removes all reactive bindings and cleans up resources for elements in the collection.
 *
 * Caution: This method should be called when elements are permanently removed
 * from the DOM to prevent memory leaks associated with active effects.
 *
 * @returns The original jQuery collection for chaining.
 */
$.fn.atomUnbind = function (this: JQuery): JQuery {
  return atomEachElement(this, (el) => registry.cleanupTree(el));
};
