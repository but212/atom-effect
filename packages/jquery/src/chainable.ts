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
  for (let i = 0, len = this.length; i < len; i++) {
    bindText(createContext(this[i]!), source, formatter);
  }
  return this;
};

/**
 * Binds element `innerHTML` to a reactive string source.
 * The value is automatically sanitized before insertion to prevent XSS.
 */
$.fn.atomHtml = function (source: ReactiveValue<string>): JQuery {
  for (let i = 0, len = this.length; i < len; i++) {
    bindHtml(createContext(this[i]!), source);
  }
  return this;
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
    console.warn(
      `${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.MISSING_CONDITION('atomClass')}`
    );
    return this;
  }
  // Hoist: build the map once, not once-per-element inside each().
  const classMap =
    typeof classNameOrMap === 'string' ? { [classNameOrMap]: condition! } : classNameOrMap;
  for (let i = 0, len = this.length; i < len; i++) {
    bindClass(createContext(this[i]!), classMap);
  }
  return this;
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
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.MISSING_SOURCE('atomCss')}`);
    return this;
  }
  // Hoist: build the map once, not once-per-element inside each().
  const cssMap: CssBindings =
    typeof propOrMap === 'string'
      ? { [propOrMap]: unit ? [source as ReactiveValue<number>, unit] : source! }
      : propOrMap;
  for (let i = 0, len = this.length; i < len; i++) {
    bindCss(createContext(this[i]!), cssMap);
  }
  return this;
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
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.MISSING_SOURCE('atomAttr')}`);
    return this;
  }
  // Hoist: build the map once, not once-per-element inside each().
  const attrMap: Record<string, ReactiveValue<PrimitiveValue>> = typeof nameOrMap === 'string'
    ? { [nameOrMap]: source! }
    : nameOrMap;
  for (let i = 0, len = this.length; i < len; i++) {
    bindAttr(createContext(this[i]!), attrMap);
  }
  return this;
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
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.MISSING_SOURCE('atomProp')}`);
    return this;
  }
  // Hoist: build the map once, not once-per-element inside each().
  const propMap: Record<string, ReactiveValue<unknown>> = typeof nameOrMap === 'string'
    ? { [nameOrMap]: source as ReactiveValue<unknown> }
    : (nameOrMap as Record<string, ReactiveValue<unknown>>);
  for (let i = 0, len = this.length; i < len; i++) {
    bindProp(createContext(this[i]!), propMap);
  }
  return this;
};

/**
 * Shows the element when `condition` is truthy (`display: ''`).
 */
$.fn.atomShow = function (condition: ReactiveValue<boolean>): JQuery {
  for (let i = 0, len = this.length; i < len; i++) {
    bindVisibility(createContext(this[i]!), condition, false);
  }
  return this;
};

/**
 * Hides the element when `condition` is truthy (`display: 'none'`).
 * Inverse of `atomShow`.
 */
$.fn.atomHide = function (condition: ReactiveValue<boolean>): JQuery {
  for (let i = 0, len = this.length; i < len; i++) {
    bindVisibility(createContext(this[i]!), condition, true);
  }
  return this;
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
  for (let i = 0, len = this.length; i < len; i++) {
    bindVal(createContext(this[i]!), atom as WritableAtom<unknown>, options as ValOptions<unknown>);
  }
  return this;
};

/**
 * Two-way binding for checkbox and radio button `checked` state.
 * Uses the jQuery event system (not native `addEventListener`) for `.trigger()` compatibility.
 */
$.fn.atomChecked = function (atom: WritableAtom<boolean>): JQuery {
  for (let i = 0, len = this.length; i < len; i++) {
    bindChecked(createContext(this[i]!), atom);
  }
  return this;
};

/**
 * Attaches a lifecycle-aware event handler using the jQuery event system.
 * The handler is automatically removed when the element is unbound via `atomUnbind`.
 *
 * @param event - jQuery event name (e.g. `'click'`, `'input'`, `'change.myns'`).
 * @param handler - Callback receiving the jQuery event object.
 */
$.fn.atomOn = function (event: string, handler: (e: JQuery.Event) => void): JQuery {
  for (let i = 0, len = this.length; i < len; i++) {
    bindOn(createContext(this[i]!), event, handler);
  }
  return this;
};

/**
 * Integrated multi-behavior reactive binding.
 * Delegates to the focused bind helpers — each option maps 1:1 to a handler.
 *
 * All conditional checks use `!== undefined` consistently so that meaningful
 * falsy values (`show: false`, `hide: false`, `class: {}`) are handled correctly.
 */
$.fn.atomBind = function <T = unknown>(options: BindingOptions<T>): JQuery {
  const { text, html, class: cls, css, attr, prop, show, hide, val, checked, on } = options;

  // Parse val once before the element loop. Result is kept as a typed pair so
  // the call site (bindVal) can receive atom and opts without a non-null assertion.
  const valParsed: { atom: WritableAtom<unknown>; opts: ValOptions<unknown> | undefined } | null =
    val === undefined
      ? null
      : Array.isArray(val)
        ? {
            atom: val[0] as WritableAtom<unknown>,
            opts: val[1] as unknown as ValOptions<unknown>,
          }
        : { atom: val as WritableAtom<unknown>, opts: undefined };

  for (let i = 0, len = this.length; i < len; i++) {
    const ctx = createContext(this[i]!);

    if (text !== undefined) bindText(ctx, text);
    if (html !== undefined) bindHtml(ctx, html);
    if (cls !== undefined) bindClass(ctx, cls);
    if (css !== undefined) bindCss(ctx, css);
    if (attr !== undefined) bindAttr(ctx, attr);
    if (prop !== undefined) bindProp(ctx, prop);
    if (show !== undefined) bindVisibility(ctx, show, false);
    if (hide !== undefined) bindVisibility(ctx, hide, true);
    if (valParsed !== null) bindVal(ctx, valParsed.atom, valParsed.opts);
    if (checked !== undefined) bindChecked(ctx, checked);
    if (on !== undefined) bindEvents(ctx, on);
  }
  return this;
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
  for (let i = 0, len = this.length; i < len; i++) {
    bindUnbind(this[i]!);
  }
  return this;
};
