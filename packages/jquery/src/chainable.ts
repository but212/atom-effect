import { effect } from '@but212/atom-effect';
import $ from 'jquery';
import { debug } from './debug';
import { registerReactiveEffect } from './effect-factory';
import { applyInputBinding } from './input-binding';
import { registry } from './registry';
import type { ReactiveValue, ValOptions, WritableAtom } from './types';
import { BindingFlags, createInputBindingState } from './types';

/**
 * Updates element text content.
 */
$.fn.atomText = function <T>(source: ReactiveValue<T>, formatter?: (v: T) => string): JQuery {
  return this.each(function () {
    registerReactiveEffect(
      this,
      source,
      ($el, val) => {
        $el.text(formatter ? formatter(val) : String(val ?? ''));
      },
      'text'
    );
  });
};

/**
 * Updates element inner HTML.
 */
$.fn.atomHtml = function (source: ReactiveValue<string>): JQuery {
  return this.each(function () {
    registerReactiveEffect(this, source, ($el, val) => $el.html(String(val ?? '')), 'html');
  });
};

/**
 * Toggles a CSS class based on boolean value.
 */
$.fn.atomClass = function (className: string, condition: ReactiveValue<boolean>): JQuery {
  return this.each(function () {
    registerReactiveEffect(
      this,
      condition,
      ($el, val) => $el.toggleClass(className, Boolean(val)),
      `class.${className}`
    );
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
    registerReactiveEffect(
      this,
      source,
      ($el, val) => {
        $el.css(prop, (unit ? `${val}${unit}` : val) as string | number);
      },
      `css.${prop}`
    );
  });
};

/**
 * Updates an HTML attribute.
 */
$.fn.atomAttr = function (name: string, source: ReactiveValue<string | boolean | null>): JQuery {
  return this.each(function () {
    registerReactiveEffect(
      this,
      source,
      ($el, val) => {
        if (val === null || val === undefined || val === false) {
          $el.removeAttr(name);
        } else {
          $el.attr(name, val === true ? name : String(val));
        }
      },
      `attr.${name}`
    );
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
    registerReactiveEffect(this, source, ($el, val) => $el.prop(name, val), `prop.${name}`);
  });
};

/**
 * Shows element when condition is true.
 */
$.fn.atomShow = function (condition: ReactiveValue<boolean>): JQuery {
  return this.each(function () {
    registerReactiveEffect(this, condition, ($el, val) => $el.toggle(Boolean(val)), 'show');
  });
};

/**
 * Hides element when condition is true.
 */
$.fn.atomHide = function (condition: ReactiveValue<boolean>): JQuery {
  return this.each(function () {
    registerReactiveEffect(this, condition, ($el, val) => $el.toggle(!val), 'hide');
  });
};

/**
 * Two-way binding for input values.
 */
$.fn.atomVal = function <T>(atom: WritableAtom<T>, options: ValOptions<T> = {}): JQuery {
  return this.each(function () {
    const $el = $(this);
    const { effect: fxFn, cleanup } = applyInputBinding($el, atom, options);
    const fx = effect(fxFn);
    registry.trackEffect(this, fx);
    registry.trackCleanup(this, cleanup);
  });
};

/**
 * Two-way binding for checkbox/radio checked state.
 */
$.fn.atomChecked = function (atom: WritableAtom<boolean>): JQuery {
  return this.each(function () {
    const $el = $(this);
    const state = createInputBindingState();

    // DOM → Atom
    const handler = () => {
      if (state.flags & BindingFlags.Busy) return;
      atom.value = !!$el.prop('checked');
    };

    $el.on('change', handler);
    registry.trackCleanup(this, () => $el.off('change', handler));

    // Atom → DOM
    const fx = effect(() => {
      state.flags |= BindingFlags.SyncingToDom;
      const val = !!atom.value;
      $el.prop('checked', val);
      debug.domUpdated($el, 'checked', val);
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
