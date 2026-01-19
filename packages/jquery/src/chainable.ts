import { effect } from '@but212/atom-effect';
import $ from 'jquery';
import { debug } from './debug';
import { applyInputBinding } from './input-binding';
import { registry } from './registry';
import type { ReactiveValue, ValOptions, WritableAtom } from './types';
import { isReactive } from './utils';

/**
 * Updates element text content.
 */
$.fn.atomText = function <T>(source: ReactiveValue<T>, formatter?: (v: T) => string): JQuery {
  if (isReactive(source)) {
    return this.each(function () {
      const $el = $(this);
      const fx = effect(() => {
        const value = source.value;
        const text = formatter ? formatter(value) : String(value ?? '');
        $el.text(text);
        debug.domUpdated($el, 'text', text);
      });
      registry.trackEffect(this, fx);
    });
  }
  const text = formatter ? formatter(source as T) : String(source ?? '');
  return this.text(text);
};

/**
 * Updates element inner HTML.
 */
$.fn.atomHtml = function (source: ReactiveValue<string>): JQuery {
  if (isReactive(source)) {
    return this.each(function () {
      const $el = $(this);
      const fx = effect(() => {
        const html = String(source.value ?? '');
        $el.html(html);
        debug.domUpdated($el, 'html', html);
      });
      registry.trackEffect(this, fx);
    });
  }
  return this.html(String(source ?? ''));
};

/**
 * Toggles a CSS class based on boolean value.
 */
$.fn.atomClass = function (className: string, condition: ReactiveValue<boolean>): JQuery {
  if (isReactive(condition)) {
    return this.each(function () {
      const $el = $(this);
      const fx = effect(() => {
        const value = Boolean(condition.value);
        $el.toggleClass(className, value);
        debug.domUpdated($el, `class.${className}`, value);
      });
      registry.trackEffect(this, fx);
    });
  }
  return this.toggleClass(className, Boolean(condition));
};

/**
 * Updates a CSS style property.
 */
$.fn.atomCss = function (
  prop: string,
  source: ReactiveValue<string | number>,
  unit?: string
): JQuery {
  if (isReactive(source)) {
    return this.each(function () {
      const $el = $(this);
      const fx = effect(() => {
        const value = source.value;
        const cssValue = unit ? `${value}${unit}` : value;
        $el.css(prop, cssValue);
        debug.domUpdated($el, `css.${prop}`, cssValue);
      });
      registry.trackEffect(this, fx);
    });
  }
  const val = unit ? `${source}${unit}` : (source as string | number);
  return this.css(prop, val);
};

/**
 * Updates an HTML attribute.
 */
$.fn.atomAttr = function (name: string, source: ReactiveValue<string | boolean | null>): JQuery {
  const applyAttr = ($el: JQuery, value: string | boolean | null) => {
    if (value === null || value === undefined || value === false) {
      $el.removeAttr(name);
    } else if (value === true) {
      $el.attr(name, name);
    } else {
      $el.attr(name, String(value));
    }
    debug.domUpdated($el, `attr.${name}`, value);
  };

  if (isReactive(source)) {
    return this.each(function () {
      const $el = $(this);
      const fx = effect(() => applyAttr($el, source.value));
      registry.trackEffect(this, fx);
    });
  }

  return this.each(function () {
    applyAttr($(this), source);
  });
};

/**
 * Updates a DOM property (e.g., checked, selected, value).
 */
$.fn.atomProp = function <T extends string | number | boolean | null | undefined>(
  name: string,
  source: ReactiveValue<T>
): JQuery {
  if (isReactive(source)) {
    return this.each(function () {
      const $el = $(this);
      const fx = effect(() => {
        const value = source.value;
        $el.prop(name, value);
        debug.domUpdated($el, `prop.${name}`, value);
      });
      registry.trackEffect(this, fx);
    });
  }
  return this.prop(name, source);
};

/**
 * Shows element when condition is true.
 */
$.fn.atomShow = function (condition: ReactiveValue<boolean>): JQuery {
  if (isReactive(condition)) {
    return this.each(function () {
      const $el = $(this);
      const fx = effect(() => {
        const value = Boolean(condition.value);
        $el.toggle(value);
        debug.domUpdated($el, 'show', value);
      });
      registry.trackEffect(this, fx);
    });
  }
  return this.toggle(Boolean(condition));
};

/**
 * Hides element when condition is true.
 */
$.fn.atomHide = function (condition: ReactiveValue<boolean>): JQuery {
  if (isReactive(condition)) {
    return this.each(function () {
      const $el = $(this);
      const fx = effect(() => {
        const value = !condition.value;
        $el.toggle(value);
        debug.domUpdated($el, 'hide', !value);
      });
      registry.trackEffect(this, fx);
    });
  }
  return this.toggle(!condition);
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
    let isUpdatingFromAtom = false;

    // DOM → Atom
    const handler = () => {
      if (!isUpdatingFromAtom) {
        atom.value = !!$el.prop('checked');
      }
    };

    $el.on('change', handler);
    registry.trackCleanup(this, () => $el.off('change', handler));

    // Atom → DOM
    const fx = effect(() => {
      isUpdatingFromAtom = true;
      const val = !!atom.value;
      $el.prop('checked', val);
      debug.domUpdated($el, 'checked', val);
      isUpdatingFromAtom = false;
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
