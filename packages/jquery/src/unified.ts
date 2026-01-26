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
    const val = cssMap[prop];
    if (val === undefined) continue;

    const camel = prop.includes('-') ? prop.replace(/-./g, (m) => m[1]!.toUpperCase()) : prop;

    if (Array.isArray(val)) {
      registerReactiveEffect(
        ctx.el,
        val[0],
        (v) => {
          style[camel] = `${v}${val[1]}`;
        },
        `css.${prop}`
      );
    } else {
      registerReactiveEffect(
        ctx.el,
        val,
        (v) => {
          style[camel] = v as string;
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
  for (const name in attrMap) {
    registerReactiveEffect(
      ctx.el,
      attrMap[name],
      (v) => {
        if (v === null || v === undefined || v === false) {
          ctx.el.removeAttribute(name);
        } else {
          ctx.el.setAttribute(name, v === true ? name : String(v));
        }
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
  cfg: WritableAtom<T> | [atom: WritableAtom<T>, options: ValOptions<T>]
): void {
  const isArr = Array.isArray(cfg);
  const { effect: fxFn, cleanup } = applyInputBinding(
    ctx.$el,
    isArr ? cfg[0] : cfg,
    isArr ? cfg[1] : {}
  );

  registry.trackEffect(ctx.el, effect(fxFn));
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
  for (const name in eventMap) {
    const handler = eventMap[name];
    if (typeof handler !== 'function') continue;
    const listener = (e: Event) => {
      batch(() =>
        (handler as JQuery.EventHandler<HTMLElement, undefined>).call(
          ctx.el,
          $.Event(e.type, { originalEvent: e }) as JQuery.TriggeredEvent<HTMLElement>
        )
      );
    };
    ctx.el.addEventListener(name, listener);
    ctx.trackCleanup(() => ctx.el.removeEventListener(name, listener));
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
