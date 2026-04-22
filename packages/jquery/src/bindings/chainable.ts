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
 * Normalizes an overloaded key-value pair or a mapping object into a uniform record.
 *
 * Logic: This utility streamlines jQuery methods that accept either `(key, value)`
 * or a single `mapping` object. It ensures a consistent Record format is passed
 * to the lower-level binding engine.
 *
 * @param keyOrMap - A property name string or a mapping object.
 * @param value - The reactive value (required if `keyOrMap` is a string).
 * @param methodName - The name of the calling method for error reporting.
 * @param errorMsg - An optional custom error message.
 * @returns A normalized Record map, or null if validation fails.
 * @internal
 */
function resolveMap<V>(
  keyOrMap: string | Record<string, V>,
  value: V | undefined,
  methodName: string,
  errorMsg: string = SYSTEM_BINDING.ERRORS.MISSING_SOURCE(methodName)
): Record<string, V> | null {
  const map =
    typeof keyOrMap === 'string' ? (value === undefined ? null : { [keyOrMap]: value }) : keyOrMap;

  if (!map) {
    console.warn(`${SYSTEM_BINDING.PREFIX} ${errorMsg}`);
    return null;
  }
  return map;
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
 * Binds CSS classes to reactive conditions.
 *
 * Logic: This method supports both toggling a single class based on a condition
 * and managing multiple classes through a mapping object.
 *
 * When to use:
 * - To toggle stateful classes like 'is-active', 'is-disabled', or 'is-loading'.
 * - To manage complex UI states defined by multiple simultaneous class flags.
 *
 * @param classNameOrMap - A class name string or a map of `{ className: conditionAtom }`.
 * @param condition - The condition for the class (required if `classNameOrMap` is a string).
 * @returns The original jQuery collection for chaining.
 *
 * @example
 * ```typescript
 * // Toggle a single class
 * $('.tab').atomClass('active', activeAtom);
 *
 * // Manage multiple classes
 * $('.panel').atomClass({
 *   'is-visible': visibleAtom,
 *   'is-collapsed': collapsedAtom
 * });
 * ```
 */
$.fn.atomClass = function (
  this: JQuery,
  classNameOrMap: string | Record<string, AsyncReactiveValue<boolean>>,
  condition?: AsyncReactiveValue<boolean>
): JQuery {
  const map = resolveMap(
    classNameOrMap,
    condition,
    'atomClass',
    SYSTEM_BINDING.ERRORS.MISSING_CONDITION('atomClass')
  );
  return map ? atomEachElement(this, (el) => bindClass(el, map)) : this;
};

/**
 * Binds inline CSS properties to reactive sources.
 *
 * Logic: Property names and units (e.g., 'px', '%') are normalized to ensure
 * consistent style application across different browsers.
 *
 * When to use:
 * - To drive visual styles such as width, opacity, or position from reactive state.
 * - To implement dynamic layouts where dimensions depend on calculated values.
 *
 * @param propOrMap - A CSS property name string or a map of `{ property: source }`.
 * @param source - The reactive value (required if `propOrMap` is a string).
 * @param unit - An optional unit string to append to numeric values.
 * @returns The original jQuery collection for chaining.
 *
 * @example
 * ```typescript
 * // Drive a single property with units
 * $('.progress-bar').atomCss('width', progressAtom, '%');
 *
 * // Drive multiple properties
 * $('.box').atomCss({
 *    opacity: opacityAtom,
 *    left: xPositionAtom
 * });
 * ```
 */
$.fn.atomCss = function (
  this: JQuery,
  propOrMap: string | CssBindings,
  source?: AsyncReactiveValue<string | number>,
  unit?: string
): JQuery {
  const value: CssValue | undefined =
    source !== undefined && unit ? [source as AsyncReactiveValue<number>, unit] : source;
  const map = resolveMap<CssValue>(propOrMap, value, 'atomCss');

  return map ? atomEachElement(this, (el) => bindCss(el, map as CssBindings)) : this;
};

/**
 * Binds HTML attributes to reactive sources.
 *
 * When to use:
 * - To synchronize standard attributes like `id`, `title`, `alt`, or `data-*`.
 *
 * @param nameOrMap - An attribute name string or a map of `{ attribute: source }`.
 * @param source - The reactive value (required if `nameOrMap` is a string).
 * @returns The original jQuery collection for chaining.
 */
$.fn.atomAttr = function (
  this: JQuery,
  nameOrMap: string | Record<string, AsyncReactiveValue<PrimitiveValue>>,
  source?: AsyncReactiveValue<PrimitiveValue>
): JQuery {
  const map = resolveMap(nameOrMap, source, 'atomAttr');
  return map ? atomEachElement(this, (el) => bindAttr(el, map)) : this;
};

/**
 * Binds DOM properties directly to reactive sources.
 *
 * When to use:
 * - To toggle stateful properties that require direct property access rather than attributes.
 *
 * @param nameOrMap - A property name string or a map of `{ property: source }`.
 * @param source - The reactive value (required if `nameOrMap` is a string).
 * @returns The original jQuery collection for chaining.
 */
$.fn.atomProp = function <T>(
  this: JQuery,
  nameOrMap: string | Record<string, AsyncReactiveValue<T>>,
  source?: AsyncReactiveValue<T>
): JQuery {
  const map = resolveMap(nameOrMap, source, 'atomProp');
  return map
    ? atomEachElement(this, (el) =>
        bindProp(el, map as Record<string, AsyncReactiveValue<unknown>>)
      )
    : this;
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
  let hasTasks = false;

  for (let i = 0, len = BINDING_TASKS.length; i < len; i++) {
    if (opt[BINDING_TASKS[i]!.key] !== undefined) {
      hasTasks = true;
      break;
    }
  }

  if (!hasTasks) return this;

  return atomEachElement(this, (el) => {
    for (let i = 0, len = BINDING_TASKS.length; i < len; i++) {
      const task = BINDING_TASKS[i]!;
      const val = opt[task.key];
      if (val !== undefined) {
        task.run(el, val);
      }
    }
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
