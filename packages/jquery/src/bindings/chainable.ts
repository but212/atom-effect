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
  CssBindings,
  CssValue,
  FormOptions,
  PrimitiveValue,
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
 * @param value - The reactive value (required if `keyOrMap` is a string).
 * @internal
 */
function resolveArgs<V>(
  keyOrMap: string | Record<string, V>,
  value: V | undefined
): Record<string, V> | null {
  return typeof keyOrMap === 'string'
    ? value === undefined
      ? null
      : { [keyOrMap]: value }
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
 * $('.count-display').atomText(counterAtom, (val) => `Total: ${val}`);
 * ```
 */
$.fn.atomText = function <T>(source: AsyncReactiveValue<T>, formatter?: (v: T) => string): JQuery {
  return atomEachElement(this, (el) => bindText(el, source, formatter));
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
  return atomEachElement(this, (el) => bindHtml(el, source));
};

/**
 * Role: Method Factory
 *
 * Logic: Method HOC
 * Encapsulates argument normalization and element iteration to provide a
 * declarative interface for chainable plugin methods.
 *
 * @param binder - The underlying binding function.
 * @param errorMsg - Error message to display if arguments are invalid.
 * @internal
 */
function createChainableMethod<V, O = V>(
  binder: (el: HTMLElement, map: Record<string, O>) => void,
  errorMsg: string,
  transformValue?: (v: V, extra?: unknown) => O
) {
  return function (
    this: JQuery,
    keyOrMap: string | Record<string, V>,
    value?: V,
    extra?: unknown
  ): JQuery {
    const resolvedValue =
      transformValue && value !== undefined
        ? transformValue(value, extra)
        : (value as unknown as O);
    const map = resolveArgs<O>(keyOrMap as string | Record<string, O>, resolvedValue);
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
$.fn.atomProp = createChainableMethod(
  bindProp as (el: HTMLElement, map: Record<string, AsyncReactiveValue<unknown>>) => void,
  SYSTEM_BINDING.ERRORS.MISSING_SOURCE('atomProp')
);

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
$.fn.atomCss = createChainableMethod<AsyncReactiveValue<string | number> | CssValue, CssValue>(
  bindCss,
  SYSTEM_BINDING.ERRORS.MISSING_SOURCE('atomCss'),
  (source, unit) =>
    unit ? [source as AsyncReactiveValue<number>, unit as string] : (source as CssValue)
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
  return atomEachElement(this, (el) => bindVisibility(el, condition, false));
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
  return atomEachElement(this, (el) => bindVisibility(el, condition, true));
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

function unpack<T, O>(val: T | [T, O]): [T, O?] {
  if (Array.isArray(val) && val.length === 2) {
    const second = val[1];
    if (
      second == null ||
      typeof second === 'function' ||
      (typeof second === 'object' && !('value' in second) && !('then' in second))
    ) {
      return val as [T, O];
    }
  }
  return [val as T];
}

/**
 * A registry of specialized binding tasks for the unified `.atomBind()` method.
 *
 * Optimization: Deterministic Execution Order
 * The order ensures consistent rendering results (e.g., text content is set
 * before class toggling) to avoid visual glitches.
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
        bindForm(
          el,
          ...(unpack(v) as [WritableAtom<object> | WritableAtom<unknown>[], FormOptions<unknown>])
        );
      }
    },
  },
  { key: 'on', run: (el, v) => bindEvents(el, v as Record<string, (e: JQuery.Event) => void>) },
];

/**
 * A unified entry point for declaring multiple reactive bindings in a single call.
 *
 * When to use:
 * - Recommended for efficiently initializing multiple bindings on an element.
 * - Suitable for maintaining organized declarations in complex UIs.
 *
 * Logic: Task Orchestration
 * Iterates through the provided configuration and executes the corresponding
 * binding tasks in a predefined, deterministic order.
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

  // Optimization: Pre-count active tasks without allocating a filtered array
  let activeCount = 0;
  for (let i = 0; i < BINDING_TASKS.length; i++) {
    const task = BINDING_TASKS[i];
    if (task !== undefined && opt[task.key] !== undefined) {
      activeCount++;
    }
  }

  if (activeCount === 0) return this;

  return atomEachElement(this, (el) => {
    const tasks = withBatchCollection(() => {
      for (let i = 0; i < BINDING_TASKS.length; i++) {
        const task = BINDING_TASKS[i];
        if (task !== undefined && opt[task.key] !== undefined) {
          task.run(el, opt[task.key]);
        }
      }
    });

    if (tasks.length > 0) {
      registerBatchedEffects(el, tasks);
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
  return atomEachElement(this, (el) => registry.cleanupTree(el));
};
