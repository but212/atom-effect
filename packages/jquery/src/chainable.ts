import $ from 'jquery';
import { ERROR_MESSAGES, LOG_PREFIXES } from './constants';
import type {
  BindingOptions,
  CssBindings,
  PrimitiveValue,
  ReactiveValue,
  ValOptions,
  WritableAtom,
} from './types';
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
  bindUnbind,
  bindVal,
  bindVisibility,
  createContext,
} from './unified';

/**
 * Binds element `textContent` to a reactive source.
 *
 * @param source - Reactive or static value to display.
 * @param formatter - Optional function to convert the value to a string.
 *   Defaults to `String(val ?? '')`.
 */
$.fn.atomText = function <T>(source: ReactiveValue<T>, formatter?: (v: T) => string): JQuery {
  return this.each(function () {
    bindText(createContext(this), source, formatter);
  });
};

/**
 * Binds element `innerHTML` to a reactive string source.
 * The value is automatically sanitized before insertion to prevent XSS.
 */
$.fn.atomHtml = function (source: ReactiveValue<string>): JQuery {
  return this.each(function () {
    bindHtml(createContext(this), source);
  });
};

/**
 * Toggles one or more CSS classes based on reactive boolean conditions.
 *
 * @overload Single class: `atomClass(className, condition)`
 * @overload Multiple classes: `atomClass({ active: isActive, disabled: isDisabled })`
 */
$.fn.atomClass = function (
  classNameOrMap: string | Record<string, ReactiveValue<boolean>>,
  condition?: ReactiveValue<boolean>
): JQuery {
  // Validate arguments once before iterating — avoids repeated warnings per element.
  if (typeof classNameOrMap === 'string' && condition === undefined) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.MISSING_CONDITION('atomClass')}`);
    return this;
  }
  return this.each(function () {
    if (typeof classNameOrMap === 'string') {
      bindClass(createContext(this), { [classNameOrMap]: condition! });
    } else {
      bindClass(createContext(this), classNameOrMap);
    }
  });
};

/**
 * Binds one or more CSS style properties to reactive values.
 *
 * @overload Single property: `atomCss(prop, source, unit?)`
 * @overload Multiple properties: `atomCss({ color: colorAtom, opacity: [opacityAtom, 'px'] })`
 */
$.fn.atomCss = function (
  propOrMap: string | CssBindings,
  source?: ReactiveValue<string | number>,
  unit?: string
): JQuery {
  // Validate arguments once before iterating — avoids repeated warnings per element.
  if (typeof propOrMap === 'string' && source === undefined) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.MISSING_SOURCE('atomCss')}`);
    return this;
  }
  return this.each(function () {
    if (typeof propOrMap === 'string') {
      bindCss(createContext(this), {
        [propOrMap]: unit ? [source as ReactiveValue<number>, unit] : source!,
      });
    } else {
      bindCss(createContext(this), propOrMap);
    }
  });
};

/**
 * Binds one or more HTML attributes to reactive values with security guards.
 * Event handler attributes (`on*`) are blocked. Dangerous URL protocols are blocked.
 *
 * @overload Single attribute: `atomAttr(name, source)`
 * @overload Multiple attributes: `atomAttr({ href: urlAtom, title: titleAtom })`
 */
$.fn.atomAttr = function (
  nameOrMap: string | Record<string, ReactiveValue<PrimitiveValue>>,
  source?: ReactiveValue<PrimitiveValue>
): JQuery {
  // Validate arguments once before iterating — avoids repeated warnings per element.
  if (typeof nameOrMap === 'string' && source === undefined) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.MISSING_SOURCE('atomAttr')}`);
    return this;
  }
  return this.each(function () {
    if (typeof nameOrMap === 'string') {
      bindAttr(createContext(this), { [nameOrMap]: source! });
    } else {
      bindAttr(createContext(this), nameOrMap);
    }
  });
};

/**
 * Binds one or more DOM properties to reactive values.
 * Dangerous properties (`innerHTML`, `outerHTML`, etc.) are blocked.
 *
 * @overload Single property: `atomProp(name, source)`
 * @overload Multiple properties: `atomProp({ disabled: isDisabled, value: valAtom })`
 */
$.fn.atomProp = function <T>(
  nameOrMap: string | Record<string, ReactiveValue<T>>,
  source?: ReactiveValue<T>
): JQuery {
  // Validate arguments once before iterating — avoids repeated warnings per element.
  if (typeof nameOrMap === 'string' && source === undefined) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.MISSING_SOURCE('atomProp')}`);
    return this;
  }
  return this.each(function () {
    const propMap: Record<string, ReactiveValue<unknown>> = typeof nameOrMap === 'string'
      ? { [nameOrMap]: source as ReactiveValue<unknown> }
      : (nameOrMap as Record<string, ReactiveValue<unknown>>);
    bindProp(createContext(this), propMap);
  });
};

/**
 * Shows the element when `condition` is truthy (`display: ''`).
 */
$.fn.atomShow = function (condition: ReactiveValue<boolean>): JQuery {
  return this.each(function () {
    bindVisibility(createContext(this), condition, false);
  });
};

/**
 * Hides the element when `condition` is truthy (`display: 'none'`).
 * Inverse of `atomShow`.
 */
$.fn.atomHide = function (condition: ReactiveValue<boolean>): JQuery {
  return this.each(function () {
    bindVisibility(createContext(this), condition, true);
  });
};

/**
 * Two-way binding for `<input>`, `<select>`, and `<textarea>` values.
 * Supports debouncing, IME composition, parse/format, and focus-aware updates.
 *
 * @param atom - Writable atom to sync with the input.
 * @param options - Optional configuration (debounce, event, parse, format, equal).
 *   An empty object and an omitted options argument are equivalent — both use defaults.
 */
$.fn.atomVal = function <T>(atom: WritableAtom<T>, options: ValOptions<T> = {}): JQuery {
  return this.each(function () {
    bindVal(createContext(this), atom as WritableAtom<unknown>, options as ValOptions<unknown>);
  });
};

/**
 * Two-way binding for checkbox and radio button `checked` state.
 * Uses the jQuery event system (not native `addEventListener`) for `.trigger()` compatibility.
 */
$.fn.atomChecked = function (atom: WritableAtom<boolean>): JQuery {
  return this.each(function () {
    bindChecked(createContext(this), atom);
  });
};

/**
 * Attaches a lifecycle-aware event handler using the jQuery event system.
 * The handler is automatically removed when the element is unbound via `atomUnbind`.
 *
 * @param event - jQuery event name (e.g. `'click'`, `'input'`, `'change.myns'`).
 * @param handler - Callback receiving the jQuery event object.
 */
$.fn.atomOn = function (event: string, handler: (e: JQuery.Event) => void): JQuery {
  return this.each(function () {
    bindOn(createContext(this), event, handler);
  });
};

/**
 * Integrated multi-behavior reactive binding.
 * Delegates to the focused bind helpers — each option maps 1:1 to a handler.
 *
 * All conditional checks use `!== undefined` consistently so that meaningful
 * falsy values (`show: false`, `hide: false`, `class: {}`) are handled correctly.
 */
$.fn.atomBind = function (options: BindingOptions): JQuery {
  return this.each(function () {
    const ctx = createContext(this);

    if (options.text !== undefined) bindText(ctx, options.text);
    if (options.html !== undefined) bindHtml(ctx, options.html);
    if (options.class !== undefined) bindClass(ctx, options.class);
    if (options.css !== undefined) bindCss(ctx, options.css);
    if (options.attr !== undefined) bindAttr(ctx, options.attr);
    if (options.prop !== undefined) bindProp(ctx, options.prop);
    if (options.show !== undefined) bindVisibility(ctx, options.show, false);
    if (options.hide !== undefined) bindVisibility(ctx, options.hide, true);
    if (options.val !== undefined) {
      if (Array.isArray(options.val)) {
        // BindingOptions.val is typed as WritableAtom | [WritableAtom, ValOptions].
        // Array.isArray narrows to the tuple branch; the cast makes the tuple explicit.
        const [atom, valOpts] = options.val as [WritableAtom<unknown>, ValOptions<unknown>];
        bindVal(ctx, atom, valOpts);
      } else {
        bindVal(ctx, options.val);
      }
    }
    if (options.checked !== undefined) bindChecked(ctx, options.checked);
    if (options.on !== undefined) bindEvents(ctx, options.on);
  });
};

/**
 * Destroys all reactive bindings on the selected elements **and their descendants**.
 * This calls `registry.cleanupTree` on each element, which disposes effects,
 * cleanup callbacks, and component lifecycle functions recursively.
 *
 * Difference from `atomUnmount`: `atomUnmount` is scoped to components mounted via
 * `atomMount`. `atomUnbind` removes all bindings regardless of how they were created.
 */
$.fn.atomUnbind = function (): JQuery {
  return this.each(function () {
    bindUnbind(this);
  });
};
