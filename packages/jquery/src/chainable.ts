import { effect } from '@but212/atom-effect';
import $ from 'jquery';
import { debug } from './debug';
import { registerReactiveEffect } from './effect-factory';
import { applyInputBinding } from './input-binding';
import { registry } from './registry';
import type { ReactiveValue, ValOptions, WritableAtom } from './types';
import { BindingFlags, createInputBindingState } from './types';
import { isDangerousCssValue, isDangerousUrl, sanitizeHtml } from './utils';

/**
 * Updates element text content.
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
    const $el = $(this);
    registerReactiveEffect(
      this,
      source,
      (val) => {
        const rawVal = String(val ?? '');
        const safeVal = sanitizeHtml(rawVal);

        if (safeVal !== rawVal) {
          console.warn('[atomHtml] Unsafe content neutralized during sanitization.');
        }
        $el.html(safeVal);
      },
      'html'
    );
  });
};

/**
 * Toggles a CSS class based on boolean value.
 */
$.fn.atomClass = function (className: string, condition: ReactiveValue<boolean>): JQuery {
  return this.each(function () {
    const $el = $(this);
    registerReactiveEffect(
      this,
      condition,
      (val) => $el.toggleClass(className, Boolean(val)),
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
    const $el = $(this);
    const update = unit
      ? (val: string | number) => {
          const strVal = `${val}${unit}`;
          if (isDangerousCssValue(strVal)) {
            console.warn(`[atomCss] Blocked dangerous value in "${prop}" property.`);
            return;
          }
          $el.css(prop, strVal);
        }
      : (val: string | number) => {
          const strVal = String(val);
          if (isDangerousCssValue(strVal)) {
            console.warn(`[atomCss] Blocked dangerous value in "${prop}" property.`);
            return;
          }
          $el.css(prop, val);
        };

    registerReactiveEffect(this, source, update, `css.${prop}`);
  });
};

/**
 * Updates an HTML attribute.
 */
$.fn.atomAttr = function (name: string, source: ReactiveValue<string | boolean | null>): JQuery {
  // Block event handler attributes (on*)
  if (/^on/i.test(name)) {
    console.warn(`[atomAttr] Blocked setting dangerous event handler attribute "${name}".`);
    return this;
  }

  return this.each(function () {
    const $el = $(this);
    registerReactiveEffect(
      this,
      source,
      (val) => {
        if (val == null || val === false) {
          $el.removeAttr(name);
          return;
        }
        const strVal = val === true ? name : String(val);
        if (isDangerousUrl(name, strVal)) {
          console.warn(`[atomAttr] Blocked dangerous protocol in "${name}" attribute.`);
          return;
        }
        $el.attr(name, strVal);
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
  // Block dangerous DOM properties that can inject raw HTML
  const dangerousProps = ['innerHTML', 'outerHTML'];
  if (dangerousProps.includes(name)) {
    console.warn(
      `[atomProp] Blocked setting dangerous property "${name}". Use atomHtml for sanitized HTML binding.`
    );
    return this;
  }

  return this.each(function () {
    const $el = $(this);
    registerReactiveEffect(this, source, (val) => $el.prop(name, val), `prop.${name}`);
  });
};

/**
 * Shows element when condition is true.
 */
$.fn.atomShow = function (condition: ReactiveValue<boolean>): JQuery {
  return this.each(function () {
    const $el = $(this);
    registerReactiveEffect(this, condition, (val) => $el.toggle(Boolean(val)), 'show');
  });
};

/**
 * Hides element when condition is true.
 */
$.fn.atomHide = function (condition: ReactiveValue<boolean>): JQuery {
  return this.each(function () {
    const $el = $(this);
    registerReactiveEffect(this, condition, (val) => $el.toggle(!val), 'hide');
  });
};

/**
 * Two-way binding for input values.
 */
$.fn.atomVal = function <T>(atom: WritableAtom<T>, options: ValOptions<T> = {}): JQuery {
  return this.each(function () {
    const tagName = this.tagName.toLowerCase();
    if (!['input', 'select', 'textarea'].includes(tagName)) {
      console.warn(`[atomVal] Element <${tagName}> is not a valid input element.`);
      return;
    }
    const { effect: fxFn, cleanup } = applyInputBinding($(this), atom, options);
    registry.trackEffect(this, effect(fxFn));
    registry.trackCleanup(this, cleanup);
  });
};

/**
 * Two-way binding for checkbox/radio checked state.
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
