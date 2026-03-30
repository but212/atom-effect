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
  bindUnbind,
  bindVal,
  bindVisibility,
  createContext,
} from '@/bindings/unified';
import { ERROR_MESSAGES, LOG_PREFIXES } from '@/constants';
import type {
  AsyncReactiveValue,
  BindingContext,
  BindingOptions,
  CssBindings,
  PrimitiveValue,
  ReactiveValue,
  ValOptions,
  WritableAtom,
} from '@/types';

import { debug } from '@/utils/debug';

/**
 * Internal helper to iterate over a jQuery set and apply a binding function
 * to each Element node. Handles nodeType check and context creation.
 */
function atomEachElement(jq: JQuery, fn: (ctx: BindingContext, el: HTMLElement) => void): JQuery {
  for (let i = 0, len = jq.length; i < len; i++) {
    const node = jq[i]!;
    if (node.nodeType === 1) {
      const el = node as HTMLElement;
      fn(createContext(el), el);
    } else if (debug.enabled) {
      debug.log(LOG_PREFIXES.BINDING, `Skipping non-Element node (nodeType=${node.nodeType})`);
    }
  }
  return jq;
}

/**
 * Binds element `textContent` to a reactive source.
 */
$.fn.atomText = function <T>(source: AsyncReactiveValue<T>, formatter?: (v: T) => string): JQuery {
  return atomEachElement(this, (ctx) => bindText(ctx, source, formatter));
};

/**
 * Binds element `innerHTML` to a reactive string source.
 */
$.fn.atomHtml = function (source: AsyncReactiveValue<string>): JQuery {
  return atomEachElement(this, (ctx) => bindHtml(ctx, source));
};

/**
 * Toggles one or more CSS classes based on reactive boolean conditions.
 */
$.fn.atomClass = function (
  classNameOrMap: string | Record<string, AsyncReactiveValue<boolean>>,
  condition?: AsyncReactiveValue<boolean>
): JQuery {
  if (typeof classNameOrMap === 'string' && condition === undefined) {
    console.warn(
      `${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.MISSING_CONDITION('atomClass')}`
    );
    return this;
  }
  return atomEachElement(this, (ctx) =>
    bindClass(
      ctx,
      typeof classNameOrMap === 'string' ? { [classNameOrMap]: condition! } : classNameOrMap
    )
  );
};

/**
 * Binds one or more CSS style properties to reactive values.
 */
$.fn.atomCss = function (
  propOrMap: string | CssBindings,
  source?: AsyncReactiveValue<string | number>,
  unit?: string
): JQuery {
  if (typeof propOrMap === 'string' && source === undefined) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.MISSING_SOURCE('atomCss')}`);
    return this;
  }
  return atomEachElement(this, (ctx) =>
    bindCss(
      ctx,
      typeof propOrMap === 'string'
        ? { [propOrMap]: unit ? [source as ReactiveValue<number>, unit] : source! }
        : propOrMap
    )
  );
};

/**
 * Binds one or more HTML attributes to reactive values with security guards.
 */
$.fn.atomAttr = function (
  nameOrMap: string | Record<string, AsyncReactiveValue<PrimitiveValue>>,
  source?: AsyncReactiveValue<PrimitiveValue>
): JQuery {
  if (typeof nameOrMap === 'string' && source === undefined) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.MISSING_SOURCE('atomAttr')}`);
    return this;
  }
  return atomEachElement(this, (ctx) =>
    bindAttr(ctx, typeof nameOrMap === 'string' ? { [nameOrMap]: source! } : nameOrMap)
  );
};

/**
 * Binds one or more DOM properties to reactive values.
 */
$.fn.atomProp = function <T>(
  nameOrMap: string | Record<string, AsyncReactiveValue<T>>,
  source?: AsyncReactiveValue<T>
): JQuery {
  if (typeof nameOrMap === 'string' && source === undefined) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.MISSING_SOURCE('atomProp')}`);
    return this;
  }
  return atomEachElement(this, (ctx) =>
    bindProp(
      ctx,
      (typeof nameOrMap === 'string' ? { [nameOrMap]: source } : nameOrMap) as Record<
        string,
        AsyncReactiveValue<unknown>
      >
    )
  );
};

/**
 * Shows the element when `condition` is truthy (`display: ''`).
 */
$.fn.atomShow = function (condition: AsyncReactiveValue<boolean>): JQuery {
  return atomEachElement(this, (ctx) => bindVisibility(ctx, condition, false));
};

/**
 * Hides the element when `condition` is truthy (`display: 'none'`).
 */
$.fn.atomHide = function (condition: AsyncReactiveValue<boolean>): JQuery {
  return atomEachElement(this, (ctx) => bindVisibility(ctx, condition, true));
};

/**
 * Two-way binding for `<input>`, `<select>`, and `<textarea>` values.
 */
$.fn.atomVal = function <T>(atom: WritableAtom<T>, options: ValOptions<T> = {}): JQuery {
  return atomEachElement(this, (ctx) =>
    bindVal(ctx, atom as WritableAtom<unknown>, options as unknown as ValOptions<unknown>)
  );
};

/**
 * Two-way binding for checkbox and radio button `checked` state.
 */
$.fn.atomChecked = function (atom: WritableAtom<boolean>): JQuery {
  return atomEachElement(this, (ctx) => bindChecked(ctx, atom));
};

/**
 * Two-way binding for an entire form.
 */
$.fn.atomForm = function <T extends object>(
  atom: WritableAtom<T>,
  options: ValOptions<unknown> = {}
): JQuery {
  return atomEachElement(this, (_, el) => {
    if (el instanceof HTMLFormElement) bindForm(el, atom, options);
  });
};

/**
 * Attaches a lifecycle-aware event handler using the jQuery event system.
 */
$.fn.atomOn = function (event: string, handler: (e: JQuery.Event) => void): JQuery {
  return atomEachElement(this, (ctx) => bindOn(ctx, event, handler));
};

/**
 * Integrated multi-behavior reactive binding.
 */
$.fn.atomBind = function <T>(options: BindingOptions<T>): JQuery {
  const { text, html, class: cls, css, attr, prop, show, hide, val, checked, form, on } = options;

  // Pre-parse 'val' to avoid repeated array checks or type casting inside the loop
  const v =
    val === undefined
      ? null
      : Array.isArray(val)
        ? { a: val[0] as WritableAtom<unknown>, o: val[1] as ValOptions<unknown> }
        : { a: val as WritableAtom<unknown>, o: undefined };

  return atomEachElement(this, (ctx) => {
    if (text !== undefined) bindText(ctx, text);
    if (html !== undefined) bindHtml(ctx, html);
    if (cls !== undefined) bindClass(ctx, cls);
    if (css !== undefined) bindCss(ctx, css);
    if (attr !== undefined) bindAttr(ctx, attr);
    if (prop !== undefined) bindProp(ctx, prop as Record<string, AsyncReactiveValue<unknown>>);
    if (show !== undefined) bindVisibility(ctx, show, false);
    if (hide !== undefined) bindVisibility(ctx, hide, true);
    if (v) bindVal(ctx, v.a, v.o);
    if (checked !== undefined) bindChecked(ctx, checked);
    if (form !== undefined && ctx.el instanceof HTMLFormElement)
      bindForm(ctx.el, form as WritableAtom<object>);
    if (on !== undefined) bindEvents(ctx, on);
  });
};

/**
 * Destroys all reactive bindings on the selected elements **and their descendants**.
 */
$.fn.atomUnbind = function (): JQuery {
  for (let i = 0, len = this.length; i < len; i++) {
    const node = this[i]!;
    if (node.nodeType === 1) bindUnbind(node as HTMLElement);
  }
  return this;
};
