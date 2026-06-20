/**
 * @module Chainable Bindings
 *
 * Responsibility:
 * Extends the jQuery prototype (`$.fn`) with reactive binding methods, enabling
 * a declarative and chainable API for connecting DOM elements to atoms.
 *
 * Design Intent:
 * Provides a familiar jQuery-style interface that abstracts away the complexity
 * of reactive synchronization and automated lifecycle management.
 */

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
import { atomEachElement } from '@/core/dom';
import { registerBatchedEffects, withBatchCollection } from '@/core/effect-factory';
import { registry } from '@/core/registry';
import type {
  AsyncReactiveValue,
  BindingOptions,
  CssValue,
  FormOptions,
  ValOptions,
  WritableAtom,
} from '@/types';

import { debug } from '@/utils/debug';

/**
 * Logic: Argument Normalization
 * Standardizes jQuery-style overloads (key-value pair or mapping object) into
 * a consistent Record for downstream binding operations.
 *
 * @param keyOrMap - A property name string or a mapping object.
 * @param bindingValue - The reactive value (required if `keyOrMap` is a string).
 * @internal
 */
function resolveArgs<V>(
  keyOrMap: string | Record<string, V>,
  bindingValue: V | undefined
): Record<string, V> | null {
  return typeof keyOrMap === 'string'
    ? bindingValue === undefined
      ? null
      : { [keyOrMap]: bindingValue }
    : keyOrMap || null;
}

/**
 * Binds the text content of elements to a reactive source.
 *
 * When to use:
 * - Recommended for label synchronization, counters, or status messages.
 * - Suitable for displaying formatted strings derived from reactive data.
 *
 * @param source - The reactive atom or computed value.
 * @param formatter - Optional function to transform the value into a string.
 * @returns The original jQuery collection for chaining.
 *
 * @example
 * ```typescript
 * $('.count-display').atomText(counterAtom, (rawValue) => `Total: ${rawValue}`);
 * ```
 */
$.fn.atomText = function <T>(
  source: AsyncReactiveValue<T>,
  formatter?: (rawValue: T) => string
): JQuery {
  return atomEachElement(this, (element) => bindText(element, source, formatter));
};

/**
 * Binds the HTML content of elements to a reactive source.
 *
 * Security: XSS Prevention
 * Ensure the source data is trusted. Rendering unsanitized HTML from user
 * input can lead to XSS vulnerabilities.
 *
 * When to use:
 * - Recommended for rendering complex markup or rich text with formatting tags.
 *
 * @param source - The reactive atom containing the HTML string.
 * @returns The original jQuery collection for chaining.
 *
 * @example
 * ```typescript
 * $('.content').atomHtml(htmlAtom);
 * ```
 */
$.fn.atomHtml = function (source: AsyncReactiveValue<string>): JQuery {
  return atomEachElement(this, (element) => bindHtml(element, source));
};

/**
 * Role: Method Factory
 *
 * Logic: Method HOC
 * Encapsulates argument normalization and element iteration to provide a
 * declarative interface for chainable plugin methods.
 *
 * @param binder - The underlying binding function.
 * @param errorMessage - Error message to display if arguments are invalid.
 * @internal
 */
function createChainableMethod<V, O = V>(
  binder: (element: HTMLElement, map: Record<string, O>) => void,
  errorMessage: string,
  transformValue?: (inputValue: V, extra?: unknown) => O
) {
  return function (
    this: JQuery,
    keyOrMap: string | Record<string, V>,
    value?: V,
    extra?: unknown
  ): JQuery {
    const resolvedValue =
      transformValue && value !== undefined ? transformValue(value, extra) : (value as O);
    const map = resolveArgs<O>(keyOrMap as string | Record<string, O>, resolvedValue);
    if (!map) {
      console.warn(`${SYSTEM_BINDING.PREFIX} ${errorMessage}`);
      return this;
    }
    return atomEachElement(this, (element) => binder(element, map));
  };
}

/**
 * Binds CSS classes to reactive conditions.
 *
 * When to use:
 * - Recommended for toggling stateful classes (e.g., 'is-active', 'is-loading').
 * - Suitable for managing complex UI states defined by multiple simultaneous flags.
 *
 * Logic: Class Toggling
 * Supports both toggling a single class based on a condition and managing
 * multiple classes through a mapping object.
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
$.fn.atomProp = createChainableMethod(bindProp, SYSTEM_BINDING.ERRORS.MISSING_SOURCE('atomProp'));

/**
 * Binds inline CSS properties to reactive sources.
 *
 * Logic: Unit Support
 * Standardizes property values with optional units (e.g., 'px', 'em')
 * before applying them to the element's style.
 *
 * @param propOrMap - A CSS property name or a binding map.
 * @param source - The reactive atom providing the value.
 * @param unit - Optional unit suffix (e.g., 'px').
 * @returns The original jQuery collection for chaining.
 *
 * @example
 * ```typescript
 * $('.box').atomCss('width', widthAtom, 'px');
 * ```
 */
$.fn.atomCss = createChainableMethod<CssValue, CssValue>(
  bindCss,
  SYSTEM_BINDING.ERRORS.MISSING_SOURCE('atomCss'),
  (source, unit) =>
    unit === undefined ? source : [source as AsyncReactiveValue<number>, String(unit)]
);

/**
 * Controls the visibility of elements based on a reactive condition.
 *
 * When to use:
 * - Recommended for conditional rendering where the element should be
 *   visible when the condition is truthy.
 *
 * @param condition - The reactive condition governing visibility.
 * @returns The original jQuery collection for chaining.
 *
 * @example
 * ```typescript
 * $('.modal').atomShow(isOpenAtom);
 * ```
 */
$.fn.atomShow = function (condition: AsyncReactiveValue<boolean>): JQuery {
  return atomEachElement(this, (element) => bindVisibility(element, condition, false));
};

/**
 * Controls the invisibility of elements based on a reactive condition.
 *
 * When to use:
 * - Recommended for conditional rendering where the element should be
 *   hidden when the condition is truthy.
 *
 * @param condition - The reactive condition governing invisibility.
 * @returns The original jQuery collection for chaining.
 *
 * @example
 * ```typescript
 * $('.overlay').atomHide(isLoadedAtom);
 * ```
 */
$.fn.atomHide = function (condition: AsyncReactiveValue<boolean>): JQuery {
  return atomEachElement(this, (element) => bindVisibility(element, condition, true));
};

/**
 * Performs two-way binding for form input values.
 *
 * When to use:
 * - Recommended for text inputs, textareas, and select menus.
 *
 * Logic: Two-Way Sync
 * Synchronizes the input's `value` with a writable atom, handling both
 * atom-to-DOM updates and DOM-to-atom changes (via `input` or `change` events).
 *
 * @param atom - The writable atom to synchronize with the input value.
 * @param options - Configuration for debouncing or event triggers.
 * @returns The original jQuery collection for chaining.
 *
 * @example
 * ```typescript
 * $('.search-input').atomVal(queryAtom, { debounce: 300 });
 * ```
 */
$.fn.atomVal = function <T>(atom: WritableAtom<T>, options: ValOptions<T> = {}): JQuery {
  return atomEachElement(this, (element) => bindVal(element, atom, options));
};

/**
 * Performs two-way binding for checkbox and radio button checked states.
 *
 * @param atom - The writable atom to synchronize with the checked state.
 * @returns The original jQuery collection for chaining.
 */
$.fn.atomChecked = function (atom: WritableAtom<boolean>): JQuery {
  return atomEachElement(this, (element) => bindChecked(element, atom));
};

/**
 * Orchestrates two-way binding for an entire form element.
 *
 * When to use:
 * - Recommended for synchronizing complex data models with HTML forms.
 *
 * Logic: Field Mapping
 * Maps form fields (via `name` attributes) to nested properties within a
 * reactive object atom using structural lenses.
 *
 * @param atom - The writable atom containing the form's data model.
 * @param options - Configuration for validation or submission handling.
 * @returns The original jQuery collection for chaining.
 *
 * @example
 * ```typescript
 * $('form').atomForm(userProfileAtom);
 * ```
 */
$.fn.atomForm = function <T extends object>(
  atom: WritableAtom<T> | WritableAtom<unknown>[],
  options: FormOptions<T> = {}
): JQuery {
  return atomEachElement(this, (element) => {
    if (element instanceof HTMLFormElement) {
      bindForm(element, atom, options);
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
  return atomEachElement(this, (element) => bindOn(element, event, handler));
};

function unpack<T, O>(unpackedValue: T | [T, O]): [T, O?] {
  if (Array.isArray(unpackedValue) && unpackedValue.length === 2) {
    const second = unpackedValue[1];
    if (
      second == null ||
      typeof second === 'function' ||
      (typeof second === 'object' && !('value' in second) && !('then' in second))
    ) {
      return unpackedValue as [T, O];
    }
  }
  return [unpackedValue as T];
}

/**
 * A unified entry point for declaring multiple reactive bindings in a single call.
 *
 * When to use:
 * - Recommended for efficiently initializing multiple bindings on an element.
 * - Suitable for maintaining organized declarations in complex UIs.
 *
 * Logic: Task Orchestration
 * Executes the corresponding binding tasks in a predefined, deterministic order.
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
$.fn.atomBind = function <T, TText>(this: JQuery, options: BindingOptions<T, TText>): JQuery {
  const bindingOptions = options;

  const hasActive =
    bindingOptions.text !== undefined ||
    bindingOptions.html !== undefined ||
    bindingOptions.class !== undefined ||
    bindingOptions.css !== undefined ||
    bindingOptions.attr !== undefined ||
    bindingOptions.prop !== undefined ||
    bindingOptions.show !== undefined ||
    bindingOptions.hide !== undefined ||
    bindingOptions.val !== undefined ||
    bindingOptions.checked !== undefined ||
    bindingOptions.form !== undefined ||
    bindingOptions.on !== undefined;

  if (!hasActive) return this;

  return atomEachElement(this, (element) => {
    const tasks = withBatchCollection(() => {
      if (bindingOptions.text !== undefined) {
        const [source, formatter] = unpack(bindingOptions.text as unknown) as [
          AsyncReactiveValue<unknown>,
          (((v: unknown) => string) | null)?,
        ];
        bindText(element, source, formatter || undefined);
      }
      if (bindingOptions.html !== undefined) {
        bindHtml(element, bindingOptions.html);
      }
      if (bindingOptions.class !== undefined) {
        bindClass(element, bindingOptions.class);
      }
      if (bindingOptions.css !== undefined) {
        bindCss(element, bindingOptions.css);
      }
      if (bindingOptions.attr !== undefined) {
        bindAttr(element, bindingOptions.attr);
      }
      if (bindingOptions.prop !== undefined) {
        bindProp(element, bindingOptions.prop);
      }
      if (bindingOptions.show !== undefined) {
        bindVisibility(element, bindingOptions.show, false);
      }
      if (bindingOptions.hide !== undefined) {
        bindVisibility(element, bindingOptions.hide, true);
      }
      if (bindingOptions.val !== undefined) {
        const [atom, valueOptions] = unpack(bindingOptions.val as unknown) as [
          WritableAtom<unknown>,
          ValOptions<unknown>?,
        ];
        bindVal(element, atom, valueOptions);
      }
      if (bindingOptions.checked !== undefined) {
        bindChecked(element, bindingOptions.checked);
      }
      if (bindingOptions.form !== undefined && element instanceof HTMLFormElement) {
        const [atomOrArr, formOptions] = unpack(bindingOptions.form as unknown) as [
          WritableAtom<object> | WritableAtom<unknown>[],
          FormOptions<unknown>?,
        ];
        bindForm(element, atomOrArr, formOptions);
      }
      if (bindingOptions.on !== undefined) {
        bindEvents(element, bindingOptions.on);
      }
    });

    if (tasks.length > 0) {
      registerBatchedEffects(element, tasks);
    }
  });
};

/**
 * Removes all reactive bindings and cleans up resources.
 *
 * Caution: Teardown Order
 * This method should be called when elements are permanently removed from
 * the DOM to prevent memory leaks from active effects.
 *
 * @returns The original jQuery collection for chaining.
 *
 * @example
 * ```typescript
 * $('.list-item').atomUnbind().remove();
 * ```
 */
$.fn.atomUnbind = function (this: JQuery): JQuery {
  return atomEachElement(this, (element) => registry.cleanupTree(element));
};
