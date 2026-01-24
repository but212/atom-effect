import { effect } from '@but212/atom-effect';
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
import { createInputBindingState } from './types';

// ============================================================================
// One-Way Binding Handlers (Atom → DOM)
// ============================================================================

function bindText<T>(ctx: BindingContext, value: ReactiveValue<T>): void {
  registerReactiveEffect(
    ctx.el,
    value,
    (val) => {
      ctx.el.textContent = String(val ?? '');
    },
    'text'
  );
}

function bindHtml(ctx: BindingContext, value: ReactiveValue<string>): void {
  registerReactiveEffect(
    ctx.el,
    value,
    (val) => {
      ctx.el.innerHTML = String(val ?? '');
    },
    'html'
  );
}

function bindClass(ctx: BindingContext, classMap: Record<string, ReactiveValue<boolean>>): void {
  for (const className in classMap) {
    registerReactiveEffect(
      ctx.el,
      classMap[className],
      (val) => {
        ctx.el.classList.toggle(className, !!val);
      },
      `class.${className}`
    );
  }
}

function bindCss(ctx: BindingContext, cssMap: Record<string, CssValue>): void {
  const style = ctx.el.style as unknown as Record<string, string>;
  for (const prop in cssMap) {
    const value = cssMap[prop];
    if (value === undefined) continue;
    const camelProp = prop.includes('-')
      ? prop.replace(/-./g, (match) => match.charAt(1).toUpperCase())
      : prop;
    if (Array.isArray(value)) {
      const [source, unit] = value;
      registerReactiveEffect(
        ctx.el,
        source,
        (val) => {
          style[camelProp] = `${val}${unit}`;
        },
        `css.${prop}`
      );
    } else {
      registerReactiveEffect(
        ctx.el,
        value,
        (val) => {
          style[camelProp] = val as string;
        },
        `css.${prop}`
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
      (v) => {
        if (v === null || v === undefined || v === false) {
          el.removeAttribute(name);
          return;
        }
        el.setAttribute(name, v === true ? name : String(v));
      },
      `attr.${name}`
    );
  }
}

function bindProp(ctx: BindingContext, propMap: Record<string, ReactiveValue<unknown>>): void {
  const el = ctx.el;
  for (const name in propMap) {
    registerReactiveEffect(
      el,
      propMap[name],
      (val) => {
        (el as unknown as Record<string, unknown>)[name] = val;
      },
      `prop.${name}`
    );
  }
}

function bindShow(ctx: BindingContext, condition: ReactiveValue<boolean>): void {
  registerReactiveEffect(
    ctx.el,
    condition,
    (val) => {
      ctx.$el.toggle(!!val);
    },
    'show'
  );
}

function bindHide(ctx: BindingContext, condition: ReactiveValue<boolean>): void {
  registerReactiveEffect(
    ctx.el,
    condition,
    (val) => {
      ctx.$el.toggle(!val);
    },
    'hide'
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
    if (state.phase !== 'idle') return;
    atom.value = ctx.$el.prop('checked');
  };

  ctx.$el.on('change', handler);
  ctx.trackCleanup(() => ctx.$el.off('change', handler));

  // Atom → DOM
  const fx = effect(() => {
    state.phase = 'syncing-to-dom';
    const val = !!atom.value;
    ctx.$el.prop('checked', val);
    debug.domUpdated(ctx.$el, 'checked', val);
    state.phase = 'idle';
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
  [eventName: string]:
    | JQuery.EventHandler<HTMLElement, undefined>
    | false
    | undefined;
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
      typedHandler.call(el, jqEvent);
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
      effects: [],
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
