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

// Cache for CSS property camelization to avoid repeated regex and check overhead
const camelCache: Record<string, string> = Object.create(null);
function getCamelCase(prop: string): string {
  let cached = camelCache[prop];
  if (cached) return cached;

  cached = prop.includes('-') ? prop.replace(/-./g, (m) => m[1]!.toUpperCase()) : prop;
  camelCache[prop] = cached;
  return cached;
}

// ============================================================================
// One-Way Binding Handlers (Atom → DOM)
// ============================================================================

function bindText<T>(ctx: BindingContext, value: ReactiveValue<T>): void {
  const el = ctx.el;
  registerReactiveEffect(
    el,
    value,
    (val) => {
      const newVal = typeof val === 'string' ? val : String(val ?? '');
      // Guard against redundant DOM writes
      if (el.textContent !== newVal) {
        el.textContent = newVal;
      }
    },
    'text'
  );
}

function bindHtml(ctx: BindingContext, value: ReactiveValue<string>): void {
  const el = ctx.el;
  registerReactiveEffect(
    el,
    value,
    (val) => {
      let newVal = String(val ?? '');
      
      // Basic XSS mitigation
      const sanitized = newVal.replace(/on\w+\s*=/gi, 'data-unsafe-attr=');
      if (sanitized !== newVal) {
         console.warn('[atomBind] Unsafe attributes detected and neutralized in html binding.');
         newVal = sanitized;
      }

      // Guard against redundant DOM writes which destroy/recreate subtrees
      if (el.innerHTML !== newVal) {
        el.innerHTML = newVal;
      }
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
  const el = ctx.el;
  const style = el.style as unknown as Record<string, string>;
  for (const prop in cssMap) {
    const val = cssMap[prop];
    if (val === undefined) continue;

    const camel = getCamelCase(prop);

    if (Array.isArray(val)) {
      registerReactiveEffect(
        el,
        val[0],
        (v) => {
          style[camel] = `${v}${val[1]}`;
        },
        `css.${prop}`
      );
    } else {
      registerReactiveEffect(
        el,
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
  const el = ctx.el;
  for (const name in attrMap) {
    registerReactiveEffect(
      el,
      attrMap[name],
      (v) => {
        if (v === null || v === undefined || v === false) {
          el.removeAttribute(name);
          return;
        }
        const newVal = v === true ? name : String(v);
        // Attribute write guard
        if (el.getAttribute(name) !== newVal) {
          el.setAttribute(name, newVal);
        }
      },
      `attr.${name}`
    );
  }
}

function bindProp(ctx: BindingContext, propMap: Record<string, ReactiveValue<unknown>>): void {
  const el = ctx.el as unknown as Record<string, unknown>;
  for (const name in propMap) {
    registerReactiveEffect(
      ctx.el,
      propMap[name],
      (val) => {
        // Redundancy check for DOM properties (e.g. className, title)
        if (el[name] !== val) {
          el[name] = val;
        }
      },
      `prop.${name}`
    );
  }
}

function bindShow(ctx: BindingContext, condition: ReactiveValue<boolean>): void {
  const el = ctx.el;
  registerReactiveEffect(
    el,
    condition,
    (val) => {
      // Direct style access is faster than $el.toggle()
      el.style.display = val ? '' : 'none';
      if (debug.enabled) debug.domUpdated(el, 'show', val);
    },
    'show'
  );
}

function bindHide(ctx: BindingContext, condition: ReactiveValue<boolean>): void {
  const el = ctx.el;
  registerReactiveEffect(
    el,
    condition,
    (val) => {
      // Direct style access is faster than $el.toggle()
      el.style.display = val ? 'none' : '';
      if (debug.enabled) debug.domUpdated(el, 'hide', val);
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
  const tagName = ctx.el.tagName.toLowerCase();
  if (!['input', 'select', 'textarea'].includes(tagName)) {
    console.warn(`[atomBind] Val binding used on non-input element <${tagName}>.`);
    return;
  }
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
  const el = ctx.el as HTMLInputElement;
  const state = createInputBindingState();

  // DOM → Atom
  const handler = () => {
    if (state.flags & BindingFlags.Busy) return;
    const current = el.checked;
    if (atom.value !== current) {
      atom.value = current;
    }
  };

  el.addEventListener('change', handler);
  ctx.trackCleanup(() => el.removeEventListener('change', handler));

  // Atom → DOM
  const fx = effect(() => {
    state.flags |= BindingFlags.SyncingToDom;
    const val = !!atom.value;
    if (el.checked !== val) {
      el.checked = val;
      if (debug.enabled) debug.domUpdated(el, 'checked', val);
    }
    state.flags &= ~BindingFlags.SyncingToDom;
  });
  registry.trackEffect(el, fx);
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
    const el = this;
    let _$el: JQuery | null = null;

    // Build binding context with a lazy JQuery wrapper
    const ctx: BindingContext = {
      get $el() {
        if (!_$el) {
          _$el = $(el);
        }
        return _$el;
      },
      el,
      trackCleanup: (fn) => registry.trackCleanup(el, fn),
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
