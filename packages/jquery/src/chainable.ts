import $ from 'jquery';
import { registry } from './registry';
import type { PrimitiveValue, ReactiveValue, ValOptions, WritableAtom } from './types';
import {
  bindAttr,
  bindChecked,
  bindClass,
  bindCss,
  bindHtml,
  bindOn,
  bindProp,
  bindText,
  bindVal,
  bindVisibility,
  createContext,
} from './unified';

/**
 * Updates element text content.
 * Kept separate from unified bindText because of the formatter parameter.
 */
$.fn.atomText = function <T>(source: ReactiveValue<T>, formatter?: (v: T) => string): JQuery {
  return this.each(function () {
    bindText(createContext(this), source, formatter);
  });
};

/**
 * Updates element inner HTML with sanitization.
 */
$.fn.atomHtml = function (source: ReactiveValue<string>): JQuery {
  return this.each(function () {
    bindHtml(createContext(this), source);
  });
};

/**
 * Toggles a CSS class based on boolean value.
 */
$.fn.atomClass = function (className: string, condition: ReactiveValue<boolean>): JQuery {
  return this.each(function () {
    bindClass(createContext(this), { [className]: condition });
  });
};

/**
 * Updates a CSS style property.
 */
$.fn.atomCss = function (
  prop: string,
  source: ReactiveValue<string | number>,
  unit?: string
): JQuery {
  return this.each(function () {
    bindCss(createContext(this), { [prop]: unit ? [source, unit] : source });
  });
};

/**
 * Updates an HTML attribute with sanitization and write guards.
 */
$.fn.atomAttr = function (name: string, source: ReactiveValue<PrimitiveValue>): JQuery {
  return this.each(function () {
    bindAttr(createContext(this), { [name]: source });
  });
};

/**
 * Updates a DOM property (e.g., checked, selected, value).
 * Generic constraint removed to allow flexibility for various property types.
 */
$.fn.atomProp = function (name: string, source: ReactiveValue<unknown>): JQuery {
  return this.each(function () {
    bindProp(createContext(this), { [name]: source });
  });
};

/**
 * Shows element when condition is true (display: '').
 */
$.fn.atomShow = function (condition: ReactiveValue<boolean>): JQuery {
  return this.each(function () {
    bindVisibility(createContext(this), condition, false, 'show');
  });
};

/**
 * Hides element when condition is true (display: 'none').
 */
$.fn.atomHide = function (condition: ReactiveValue<boolean>): JQuery {
  return this.each(function () {
    bindVisibility(createContext(this), condition, true, 'hide');
  });
};

/**
 * Two-way binding for input values.
 */
$.fn.atomVal = function <T>(atom: WritableAtom<T>, options: ValOptions<T> = {}): JQuery {
  return this.each(function () {
    bindVal(
      createContext(this),
      options && Object.keys(options).length > 0 ? [atom, options] : atom
    );
  });
};

/**
 * Two-way binding for checkbox/radio checked state.
 * Uses jQuery event system (not native) for compatibility with $.fn.trigger().
 */
$.fn.atomChecked = function (atom: WritableAtom<boolean>): JQuery {
  return this.each(function () {
    bindChecked(createContext(this), atom);
  });
};

/**
 * Binds an event handler with automatic cleanup and batched execution.
 */
$.fn.atomOn = function (event: string, handler: (e: JQuery.Event) => void): JQuery {
  return this.each(function () {
    bindOn(createContext(this), event, handler);
  });
};

/**
 * Destroys all reactive bindings on the selected elements and their children.
 */
$.fn.atomUnbind = function (): JQuery {
  return this.each(function () {
    registry.cleanupTree(this);
  });
};
