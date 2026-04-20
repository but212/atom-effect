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
import { ERROR_MESSAGES, LOG_PREFIXES } from '@/constants';
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
 * Resolves a single key-value pair or a map into a uniform map.
 * Used to simplify multiple binding methods.
 */
function resolveMap<V>(
  keyOrMap: string | Record<string, V>,
  value: V | undefined,
  methodName: string,
  errorMsg: string = ERROR_MESSAGES.BINDING.MISSING_SOURCE(methodName)
): Record<string, V> | null {
  const map =
    typeof keyOrMap === 'string' ? (value === undefined ? null : { [keyOrMap]: value }) : keyOrMap;

  if (!map) {
    console.warn(`${LOG_PREFIXES.BINDING} ${errorMsg}`);
    return null;
  }
  return map;
}

/**
 * Binds an atom's value to the text content of the matching elements.
 *
 * @example
 * $('.count').atomText(counterAtom, (v) => `Current: ${v}`);
 */
$.fn.atomText = function <T>(source: AsyncReactiveValue<T>, formatter?: (v: T) => string): JQuery {
  return atomEachElement(this, (el) => bindText(el, source, formatter));
};

/**
 * Binds an atom's value to the innerHTML of the matching elements.
 * Warning: Ensure the source data is trusted to prevent XSS.
 */
$.fn.atomHtml = function (source: AsyncReactiveValue<string>): JQuery {
  return atomEachElement(this, (el) => bindHtml(el, source));
};

/**
 * Reactively toggles CSS classes.
 *
 * Supports two patterns:
 * 1. Single class: .atomClass('active', conditionAtom)
 * 2. Class map: .atomClass({ 'is-loading': loadingAtom, 'is-hidden': hiddenAtom })
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
    ERROR_MESSAGES.BINDING.MISSING_CONDITION('atomClass')
  );
  return map ? atomEachElement(this, (el) => bindClass(el, map)) : this;
};

/**
 * Reactively updates CSS properties.
 *
 * Supports two patterns:
 * 1. Single property: .atomCss('opacity', valueAtom)
 * 2. Property map: .atomCss({ width: '100px', height: heightAtom })
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

/** Reactively updates DOM attributes based on atom changes. */
$.fn.atomAttr = function (
  this: JQuery,
  nameOrMap: string | Record<string, AsyncReactiveValue<PrimitiveValue>>,
  source?: AsyncReactiveValue<PrimitiveValue>
): JQuery {
  const map = resolveMap(nameOrMap, source, 'atomAttr');
  return map ? atomEachElement(this, (el) => bindAttr(el, map)) : this;
};

/** Reactively updates DOM properties (e.g., 'disabled', 'readOnly'). */
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

/** Toggles visibility (display: none) when the condition is true. */
$.fn.atomShow = function (condition: AsyncReactiveValue<boolean>): JQuery {
  return atomEachElement(this, (el) => bindVisibility(el, condition, false));
};

/** Hides the element (display: none) when the condition is true. */
$.fn.atomHide = function (condition: AsyncReactiveValue<boolean>): JQuery {
  return atomEachElement(this, (el) => bindVisibility(el, condition, true));
};

/**
 * Two-way binding for form input values.
 * Automatically synchronizes the input state with the writable atom.
 */
$.fn.atomVal = function <T>(atom: WritableAtom<T>, options: ValOptions<T> = {}): JQuery {
  return atomEachElement(this, (el) =>
    bindVal(el, atom as WritableAtom<unknown>, options as ValOptions<unknown>)
  );
};

/** Two-way binding for checkboxes and radio buttons. */
$.fn.atomChecked = function (atom: WritableAtom<boolean>): JQuery {
  return atomEachElement(this, (el) => bindChecked(el, atom));
};

/**
 * Orchestrates two-way binding for an entire form.
 * Maps form fields to properties of a reactive object.
 */
$.fn.atomForm = function <T extends object>(
  atom: WritableAtom<T>,
  options: FormOptions<T> = {}
): JQuery {
  return atomEachElement(this, (el) => {
    if (el instanceof HTMLFormElement) {
      bindForm(el, atom as WritableAtom<object>, options as unknown as FormOptions<unknown>);
    } else {
      debug.warn(LOG_PREFIXES.BINDING, 'Skipping non-Form element for atomForm');
    }
  });
};

/** Configures a standard event listener with automatic cleanup. */
$.fn.atomOn = function (event: string, handler: (e: JQuery.Event) => void): JQuery {
  return atomEachElement(this, (el) => bindOn(el, event, handler));
};

interface BindingTask {
  key: keyof BindingOptions<unknown>;
  run: (el: HTMLElement, val: unknown) => void;
}

/**
 * Registry of available binding tasks for the unified .atomBind() method.
 * Note: Keeps the order of execution consistent during multi-binding.
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
 * Unified entry point for declaring multiple reactive bindings in a single call.
 *
 * @example
 * $('.btn').atomBind({
 *   text: labelAtom,
 *   class: { 'is-primary': primaryAtom },
 *   on: { click: handleClick }
 * });
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

/** Manually destroys all reactive bindings associated with the elements in the collection. */
$.fn.atomUnbind = function (this: JQuery): JQuery {
  return atomEachElement(this, (el) => registry.cleanupTree(el));
};
