import { batch, effect } from '@but212/atom-effect';
import $ from 'jquery';
import { debug } from './debug';
import { registerReactiveEffect } from './effect-factory';
import { applyInputBinding } from './input-binding';
import { registry } from './registry';
import type {
  BindingContext,
  BindingOptions,
  CssValue,
  ReactiveValue,
  ValOptions,
  WritableAtom,
} from './types';
import { BindingFlags, createInputBindingState } from './types';
import { toCamelCase } from './utils';

// ============================================================================
// One-Way Binding Handlers (Atom → DOM)
// ============================================================================

function bindText<T>(ctx: BindingContext, value: ReactiveValue<T>): void {
  registerReactiveEffect(
    ctx.el,
    value,
    (_, val) => {
      ctx.el.textContent = String(val ?? '');
    },
    'text',
    ctx.$el
  );
}

function bindHtml(ctx: BindingContext, value: ReactiveValue<string>): void {
  registerReactiveEffect(
    ctx.el,
    value,
    (_, val) => {
      ctx.el.innerHTML = String(val ?? '');
    },
    'html',
    ctx.$el
  );
}

function bindClass(ctx: BindingContext, classMap: Record<string, ReactiveValue<boolean>>): void {
  const el = ctx.el;
  for (const className in classMap) {
    registerReactiveEffect(
      el,
      classMap[className],
      (_, val) => {
        el.classList.toggle(className, !!val);
      },
      `class.${className}`,
      ctx.$el
    );
  }
}

function bindCss(ctx: BindingContext, cssMap: Record<string, CssValue>): void {
  const el = ctx.el;
  const style = el.style as unknown as Record<string, string>;
  for (const prop in cssMap) {
    const value = cssMap[prop];
    if (value === undefined) continue;

    const camelProp = toCamelCase(prop);
    if (Array.isArray(value)) {
      const [source, unit] = value;
      registerReactiveEffect(
        el,
        source,
        (_, val) => {
          style[camelProp] = `${val}${unit}`;
        },
        `css.${prop}`,
        ctx.$el
      );
    } else {
      registerReactiveEffect(
        el,
        value,
        (_, val) => {
          style[camelProp] = val as string;
        },
        `css.${prop}`,
        ctx.$el
      );
    }
  }
}

function bindAttr(
  ctx: BindingContext,
  attrMap: Record<string, ReactiveValue<string | boolean | null>>
): void {
  const el = ctx.el;
  for (const name in attrMap) {
    const value = attrMap[name];
    registerReactiveEffect(
      el,
      value,
      (_, v) => {
        if (v === null || v === undefined || v === false) {
          el.removeAttribute(name);
          return;
        }
        el.setAttribute(name, v === true ? name : String(v));
      },
      `attr.${name}`,
      ctx.$el
    );
  }
}

function bindProp(ctx: BindingContext, propMap: Record<string, ReactiveValue<unknown>>): void {
  const el = ctx.el;
  for (const name in propMap) {
    registerReactiveEffect(
      el,
      propMap[name],
      (_, val) => {
        (el as unknown as Record<string, unknown>)[name] = val;
      },
      `prop.${name}`,
      ctx.$el
    );
  }
}

function bindShow(ctx: BindingContext, condition: ReactiveValue<boolean>): void {
  registerReactiveEffect(
    ctx.el,
    condition,
    ($el, val) => {
      $el.toggle(!!val);
    },
    'show',
    ctx.$el
  );
}

function bindHide(ctx: BindingContext, condition: ReactiveValue<boolean>): void {
  registerReactiveEffect(
    ctx.el,
    condition,
    ($el, val) => {
      $el.toggle(!val);
    },
    'hide',
    ctx.$el
  );
}

/**
 * Two-way value binding with full feature parity to $.fn.atomVal.
 * Supports parse/format options, debouncing, IME composition, and focus-aware updates.
 */
function bindVal<T>(
  ctx: BindingContext,
  valConfig: WritableAtom<T> | [atom: WritableAtom<T>, options: ValOptions<T>]
): void {
  const atom = Array.isArray(valConfig) ? valConfig[0] : valConfig;
  const options = Array.isArray(valConfig) ? valConfig[1] : {};

  const { effect: fxFn, cleanup } = applyInputBinding(ctx.$el, atom, options);
  const fx = effect(fxFn);

  registry.trackEffect(ctx.el, fx);
  ctx.trackCleanup(cleanup);
}

function bindChecked(ctx: BindingContext, atom: WritableAtom<boolean>): void {
  const state = createInputBindingState();

  // DOM → Atom
  const handler = () => {
    if (state.flags & BindingFlags.Busy) return;
    atom.value = ctx.$el.prop('checked');
  };

  ctx.$el.on('change', handler);
  ctx.trackCleanup(() => ctx.$el.off('change', handler));

  // Atom → DOM
  const fx = effect(() => {
    state.flags |= BindingFlags.SyncingToDom;
    const val = !!atom.value;
    ctx.$el.prop('checked', val);
    debug.domUpdated(ctx.$el, 'checked', val);
    state.flags &= ~BindingFlags.SyncingToDom;
  });
  registry.trackEffect(ctx.el, fx);
}

// ============================================================================
// Event Binding Handler
// ============================================================================

/** Event handler map type for atomBind({ on: ... }) using jQuery's event handler signature */
type EventBindingMap = {
  [K in keyof JQuery.TypeToTriggeredEventMap<HTMLElement, undefined, HTMLElement, HTMLElement>]?:
    | JQuery.TypeEventHandler<HTMLElement, undefined, HTMLElement, HTMLElement, K>
    | false;
} & {
  [eventName: string]: JQuery.EventHandler<HTMLElement, undefined> | false | undefined;
};

function bindEvents(ctx: BindingContext, eventMap: EventBindingMap): void {
  const el = ctx.el;
  for (const eventName in eventMap) {
    const handler = eventMap[eventName];
    if (typeof handler !== 'function') continue;
    const typedHandler = handler as JQuery.EventHandler<HTMLElement, undefined>;
    const listener = (e: Event) => {
      // Wrap native Event into jQuery.Event with originalEvent preserved
      const jqEvent = $.Event(e.type, { originalEvent: e }) as JQuery.TriggeredEvent<HTMLElement>;
      batch(() => typedHandler.call(el, jqEvent));
    };
    el.addEventListener(eventName, listener);
    ctx.trackCleanup(() => el.removeEventListener(eventName, listener));
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Extends jQuery with atom-based data binding capabilities.
 *
 * This plugin synchronizes DOM element states (text, html, classes, styles, etc.)
 * with reactive atoms. Handlers are modular and focused for maintainability.
 */
$.fn.atomBind = function <T extends string | number | boolean | null | undefined>(
  options: BindingOptions<T>
): JQuery {
  return this.each(function () {
    // Lazy element wrapping: only wrap if needed by legacy handlers (like bindVal/applyInputBinding)
    const $el = $(this);

    // Build binding context
    const ctx: BindingContext = {
      $el,
      el: this,
      trackCleanup: (fn) => registry.trackCleanup(this, fn),
    };

    // Apply bindings through focused handlers
    if (options.text !== undefined) bindText(ctx, options.text);
    if (options.html !== undefined) bindHtml(ctx, options.html);
    if (options.class) bindClass(ctx, options.class);
    if (options.css) bindCss(ctx, options.css);
    if (options.attr) bindAttr(ctx, options.attr);
    if (options.prop) bindProp(ctx, options.prop);
    if (options.show !== undefined) bindShow(ctx, options.show);
    if (options.hide !== undefined) bindHide(ctx, options.hide);
    if (options.val !== undefined) bindVal(ctx, options.val);
    if (options.checked !== undefined) bindChecked(ctx, options.checked);
    if (options.on) bindEvents(ctx, options.on);
  });
};
