import { effect } from '@but212/atom-effect';
import $ from 'jquery';
import { debug } from './debug';
import { registerReactiveEffect } from './effect-factory';
import { registry } from './registry';
import type { ReactiveValue, ValOptions, WritableAtom } from './types';
import { BindingFlags, createInputBindingState } from './types';
import {
  bindAttr,
  bindClass,
  bindCss,
  bindHtml,
  bindProp,
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
    const $el = $(this);
    const update = formatter
      ? (val: T) => $el.text(formatter(val))
      : (val: T) => $el.text(String(val ?? ''));

    registerReactiveEffect(this, source, update, 'text');
  });
};

/**
 * Updates element inner HTML.
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
 * Updates an HTML attribute.
 */
$.fn.atomAttr = function (name: string, source: ReactiveValue<string | boolean | null>): JQuery {
  return this.each(function () {
    bindAttr(createContext(this), { [name]: source });
  });
};

/**
 * Updates a DOM property (e.g., checked, selected, value).
 */
$.fn.atomProp = function <T extends string | number | boolean | null | undefined>(
  name: string,
  source: ReactiveValue<T>
): JQuery {
  return this.each(function () {
    bindProp(createContext(this), { [name]: source });
  });
};

/**
 * Shows element when condition is true.
 */
$.fn.atomShow = function (condition: ReactiveValue<boolean>): JQuery {
  return this.each(function () {
    bindVisibility(createContext(this), condition, false, 'show');
  });
};

/**
 * Hides element when condition is true.
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
    const $el = $(this);
    const element = this as HTMLInputElement;
    const state = createInputBindingState();

    // DOM → Atom
    const handler = () => {
      if (state.flags & BindingFlags.Busy) return;
      const checked = element.checked;
      if (atom.value !== checked) {
        atom.value = checked;
      }
    };

    $el.on('change', handler);
    registry.trackCleanup(this, () => $el.off('change', handler));

    // Atom → DOM
    const fx = effect(() => {
      state.flags |= BindingFlags.SyncingToDom;
      const val = !!atom.value;
      if (element.checked !== val) {
        element.checked = val;
        debug.domUpdated($el, 'checked', val);
      }
      state.flags &= ~BindingFlags.SyncingToDom;
    });
    registry.trackEffect(this, fx);
  });
};

/**
 * Binds an event handler with automatic cleanup.
 */
$.fn.atomOn = function (event: string, handler: (e: JQuery.Event) => void): JQuery {
  return this.each(function () {
    const $el = $(this);
    $el.on(event, handler);
    registry.trackCleanup(this, () => $el.off(event, handler));
  });
};

/**
 * Removes all atom bindings.
 */
$.fn.atomUnbind = function (): JQuery {
  return this.each(function () {
    registry.cleanupTree(this);
  });
};
