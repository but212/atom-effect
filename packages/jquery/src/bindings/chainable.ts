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
  FormOptions,
  PrimitiveValue,
  ReactiveValue,
  ValOptions,
  WritableAtom,
} from '@/types';

import { debug } from '@/utils/debug';

/**
 * Internal helper to iterate over a jQuery set and apply a binding function
 * to each Element node. Handles nodeType check and conditional context creation.
 */
function atomEachElement(
  jq: JQuery,
  fn: (ctx: BindingContext | null, el: HTMLElement) => void,
  options: { needsCtx?: boolean } = {}
): JQuery {
  for (let i = 0, len = jq.length; i < len; i++) {
    const node = jq[i];
    if (node?.nodeType === 1) {
      const el = node as HTMLElement;
      fn(options.needsCtx ? createContext(el) : null, el);
    } else if (node) {
      debug.log(LOG_PREFIXES.BINDING, `Skipping non-Element node (nodeType=${node.nodeType})`);
    }
  }
  return jq;
}

/** Utility to handle [source, options] tuple arguments in integrated bindings. */
function unpack<T, O>(val: T | [T, O]): [T, O?] {
  return Array.isArray(val) &&
    val.length === 2 &&
    (typeof val[0] === 'function' ||
      (val[0] !== null &&
        typeof val[0] === 'object' &&
        ('value' in (val[0] as object) || 'then' in (val[0] as object))))
    ? (val as [T, O])
    : [val as T];
}

/**
 * Binds element `textContent` to a reactive source.
 */
$.fn.atomText = function <T>(source: AsyncReactiveValue<T>, formatter?: (v: T) => string): JQuery {
  return atomEachElement(this, (ctx) => bindText(ctx!, source, formatter), { needsCtx: true });
};

/**
 * Binds element `innerHTML` to a reactive string source.
 */
$.fn.atomHtml = function (source: AsyncReactiveValue<string>): JQuery {
  return atomEachElement(this, (ctx) => bindHtml(ctx!, source), { needsCtx: true });
};

/**
 * Toggles one or more CSS classes based on reactive boolean conditions.
 */
$.fn.atomClass = function (
  this: JQuery,
  classNameOrMap: string | Record<string, AsyncReactiveValue<boolean>>,
  condition?: AsyncReactiveValue<boolean>
): JQuery {
  const map =
    typeof classNameOrMap === 'string'
      ? condition === undefined
        ? null
        : { [classNameOrMap]: condition }
      : classNameOrMap;

  if (!map) {
    console.warn(
      `${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.MISSING_CONDITION('atomClass')}`
    );
    return this;
  }

  return atomEachElement(this, (ctx) => bindClass(ctx!, map), { needsCtx: true });
};

/**
 * Binds one or more CSS style properties to reactive values.
 */
$.fn.atomCss = function (
  this: JQuery,
  propOrMap: string | CssBindings,
  source?: AsyncReactiveValue<string | number>,
  unit?: string
): JQuery {
  const map =
    typeof propOrMap === 'string'
      ? source === undefined
        ? null
        : { [propOrMap]: unit ? [source as ReactiveValue<number>, unit] : source! }
      : propOrMap;

  if (!map) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.MISSING_SOURCE('atomCss')}`);
    return this;
  }

  return atomEachElement(this, (ctx) => bindCss(ctx!, map as CssBindings), { needsCtx: true });
};

/**
 * Binds one or more HTML attributes to reactive values with security guards.
 */
$.fn.atomAttr = function (
  this: JQuery,
  nameOrMap: string | Record<string, AsyncReactiveValue<PrimitiveValue>>,
  source?: AsyncReactiveValue<PrimitiveValue>
): JQuery {
  const map =
    typeof nameOrMap === 'string'
      ? source === undefined
        ? null
        : { [nameOrMap]: source }
      : nameOrMap;

  if (!map) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.MISSING_SOURCE('atomAttr')}`);
    return this;
  }

  return atomEachElement(this, (ctx) => bindAttr(ctx!, map), { needsCtx: true });
};

/**
 * Binds one or more DOM properties to reactive values.
 */
$.fn.atomProp = function <T>(
  this: JQuery,
  nameOrMap: string | Record<string, AsyncReactiveValue<T>>,
  source?: AsyncReactiveValue<T>
): JQuery {
  const map =
    typeof nameOrMap === 'string'
      ? source === undefined
        ? null
        : ({ [nameOrMap]: source } as Record<string, AsyncReactiveValue<unknown>>)
      : (nameOrMap as Record<string, AsyncReactiveValue<unknown>>);

  if (!map) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.MISSING_SOURCE('atomProp')}`);
    return this;
  }

  return atomEachElement(this, (ctx) => bindProp(ctx!, map), { needsCtx: true });
};

/**
 * Shows the element when `condition` is truthy (`display: ''`).
 */
$.fn.atomShow = function (condition: AsyncReactiveValue<boolean>): JQuery {
  return atomEachElement(this, (ctx) => bindVisibility(ctx!, condition, false), {
    needsCtx: true,
  });
};

/**
 * Hides the element when `condition` is truthy (`display: 'none'`).
 */
$.fn.atomHide = function (condition: AsyncReactiveValue<boolean>): JQuery {
  return atomEachElement(this, (ctx) => bindVisibility(ctx!, condition, true), {
    needsCtx: true,
  });
};

/**
 * Two-way binding for `<input>`, `<select>`, and `<textarea>` values.
 */
$.fn.atomVal = function <T>(atom: WritableAtom<T>, options: ValOptions<T> = {}): JQuery {
  return atomEachElement(
    this,
    (ctx) => bindVal(ctx!, atom as WritableAtom<unknown>, options as ValOptions<unknown>),
    { needsCtx: true }
  );
};

/**
 * Two-way binding for checkbox and radio button `checked` state.
 */
$.fn.atomChecked = function (atom: WritableAtom<boolean>): JQuery {
  return atomEachElement(this, (ctx) => bindChecked(ctx!, atom), { needsCtx: true });
};

/**
 * Two-way binding for an entire form.
 */
$.fn.atomForm = function <T extends object>(
  atom: WritableAtom<T>,
  options: FormOptions<unknown> = {}
): JQuery {
  return atomEachElement(
    this,
    (_, el) => {
      if (el instanceof HTMLFormElement) bindForm(el, atom, options);
      else debug.log(LOG_PREFIXES.BINDING, 'Skipping non-Form element for atomForm');
    },
    { needsCtx: false }
  );
};

/**
 * Attaches a lifecycle-aware event handler using the jQuery event system.
 */
$.fn.atomOn = function (event: string, handler: (e: JQuery.Event) => void): JQuery {
  return atomEachElement(this, (ctx) => bindOn(ctx!, event, handler), { needsCtx: true });
};

/**
 * Lookup table for reactive binding handlers.
 * Ordered to match the bitmask bits in atomBind.
 */
const BIND_HANDLERS: Array<(ctx: BindingContext, options: BindingOptions<unknown>) => void> = [
  (ctx, o) =>
    bindText(ctx, ...(unpack(o.text!) as [AsyncReactiveValue<unknown>, (v: unknown) => string])), // 1 << 0
  (ctx, o) => bindHtml(ctx, o.html!), // 1 << 1
  (ctx, o) => bindClass(ctx, o.class!), // 1 << 2
  (ctx, o) => bindCss(ctx, o.css!), // 1 << 3
  (ctx, o) => bindAttr(ctx, o.attr!), // 1 << 4
  (ctx, o) => bindProp(ctx, o.prop as Record<string, AsyncReactiveValue<unknown>>), // 1 << 5
  (ctx, o) => bindVisibility(ctx, o.show!, false), // 1 << 6
  (ctx, o) => bindVisibility(ctx, o.hide!, true), // 1 << 7
  (ctx, o) => bindVal(ctx, ...(unpack(o.val!) as [WritableAtom<unknown>, ValOptions<unknown>])), // 1 << 8
  (ctx, o) => bindChecked(ctx, o.checked!), // 1 << 9
  (ctx, o) => {
    // 1 << 10: form
    if (ctx.el instanceof HTMLFormElement) {
      bindForm(ctx.el, ...(unpack(o.form!) as [WritableAtom<object>, FormOptions<unknown>]));
    }
  },
  (ctx, o) => bindEvents(ctx, o.on!), // 1 << 11
];

/**
 * Integrated multi-behavior reactive binding.
 * Uses a bitmask dispatch strategy to minimize branch mispredictions in hot-path.
 */
$.fn.atomBind = function <T>(this: JQuery, options: BindingOptions<T>): JQuery {
  let mask = 0;
  if (options.text !== undefined) mask |= 1 << 0;
  if (options.html !== undefined) mask |= 1 << 1;
  if (options.class !== undefined) mask |= 1 << 2;
  if (options.css !== undefined) mask |= 1 << 3;
  if (options.attr !== undefined) mask |= 1 << 4;
  if (options.prop !== undefined) mask |= 1 << 5;
  if (options.show !== undefined) mask |= 1 << 6;
  if (options.hide !== undefined) mask |= 1 << 7;
  if (options.val !== undefined) mask |= 1 << 8;
  if (options.checked !== undefined) mask |= 1 << 9;
  if (options.form !== undefined) mask |= 1 << 10;
  if (options.on !== undefined) mask |= 1 << 11;

  if (mask === 0) return this;

  return atomEachElement(
    this,
    (ctx) => {
      let m = mask;
      while (m > 0) {
        const bit = m & -m;
        const idx = 31 - Math.clz32(bit);
        BIND_HANDLERS[idx]!(ctx!, options as BindingOptions<unknown>);
        m ^= bit;
      }
    },
    { needsCtx: true }
  );
};

/**
 * Destroys all reactive bindings on the selected elements **and their descendants**.
 */
$.fn.atomUnbind = function (this: JQuery): JQuery {
  return atomEachElement(this, (_, el) => bindUnbind(el), { needsCtx: false });
};
