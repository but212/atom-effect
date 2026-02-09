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
import { isDangerousCssValue, isDangerousUrl, sanitizeHtml } from './utils';

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
// Binding Context Factory
// ============================================================================

export function createContext(el: HTMLElement): BindingContext {
  let _$el: JQuery | null = null;
  return {
    get $el() {
      if (!_$el) _$el = $(el);
      return _$el;
    },
    el,
    trackCleanup: (fn) => registry.trackCleanup(el, fn),
  };
}

// ============================================================================
// One-Way Binding Handlers (Atom → DOM)
// ============================================================================

export function bindText<T>(ctx: BindingContext, value: ReactiveValue<T>): void {
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

export function bindHtml(ctx: BindingContext, value: ReactiveValue<string>): void {
  const el = ctx.el;
  registerReactiveEffect(
    el,
    value,
    (val) => {
      const newVal = String(val ?? '');
      const sanitized = sanitizeHtml(newVal);

      if (sanitized !== newVal) {
        console.warn('[atomBind] Unsafe content neutralized during sanitization.');
      }

      const safeVal = sanitized;

      // Guard against redundant DOM writes which destroy/recreate subtrees
      if (el.innerHTML !== safeVal) {
        el.innerHTML = safeVal;
      }
    },
    'html'
  );
}

export function bindClass(
  ctx: BindingContext,
  classMap: Record<string, ReactiveValue<boolean>>
): void {
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

export function bindCss(ctx: BindingContext, cssMap: Record<string, CssValue>): void {
  const el = ctx.el;
  const style = el.style as unknown as Record<string, string>;
  for (const prop in cssMap) {
    const val = cssMap[prop];
    if (val === undefined) continue;

    const camel = getCamelCase(prop);
    const isArr = Array.isArray(val);
    const source = isArr ? val[0] : val;
    const unit = isArr ? val[1] : '';

    registerReactiveEffect(
      el,
      source,
      (v) => {
        const strVal = unit ? `${v}${unit}` : String(v);
        if (isDangerousCssValue(strVal)) {
          console.warn(`[atomBind] Blocked dangerous value in "${prop}" property.`);
          return;
        }
        style[camel] = strVal;
      },
      `css.${prop}`
    );
  }
}

export function bindAttr(
  ctx: BindingContext,
  attrMap: Record<string, ReactiveValue<string | boolean | null>>
): void {
  const el = ctx.el;
  for (const name in attrMap) {
    // Block event handler attributes (on*)
    if (/^on/i.test(name)) {
      console.warn(`[atomBind] Blocked setting dangerous event handler attribute "${name}".`);
      continue;
    }

    registerReactiveEffect(
      el,
      attrMap[name],
      (v) => {
        if (v === null || v === undefined || v === false) {
          el.removeAttribute(name);
          return;
        }
        const newVal = v === true ? name : String(v);
        if (isDangerousUrl(name, newVal)) {
          console.warn(`[atomBind] Blocked dangerous protocol in "${name}" attribute.`);
          return;
        }
        // Attribute write guard
        if (el.getAttribute(name) !== newVal) {
          el.setAttribute(name, newVal);
        }
      },
      `attr.${name}`
    );
  }
}

const DANGEROUS_PROPS = ['innerHTML', 'outerHTML'];

export function bindProp(
  ctx: BindingContext,
  propMap: Record<string, ReactiveValue<unknown>>
): void {
  const el = ctx.el as unknown as Record<string, unknown>;
  for (const name in propMap) {
    // Block dangerous DOM properties that can inject raw HTML
    if (DANGEROUS_PROPS.includes(name)) {
      console.warn(
        `[atomBind] Blocked setting dangerous property "${name}". Use html binding for sanitized HTML.`
      );
      continue;
    }

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

export function bindVisibility(
  ctx: BindingContext,
  condition: ReactiveValue<boolean>,
  invert: boolean,
  label: 'show' | 'hide'
): void {
  const el = ctx.el;
  registerReactiveEffect(
    el,
    condition,
    (val) => {
      const visible = invert ? !val : !!val;
      el.style.display = visible ? '' : 'none';
      if (debug.enabled) debug.domUpdated(el, label, val);
    },
    label
  );
}

/**
 * Two-way value binding with full feature parity to $.fn.atomVal.
 * Supports parse/format options, debouncing, IME composition, and focus-aware updates.
 */
export function bindVal<T>(
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

export function bindChecked(ctx: BindingContext, atom: WritableAtom<boolean>): void {
  const el = ctx.el as HTMLInputElement;
  const $el = ctx.$el;
  const state = createInputBindingState();

  // DOM → Atom (jQuery events for .trigger() compatibility)
  const handler = () => {
    if (state.flags & BindingFlags.Busy) return;
    const current = el.checked;
    if (atom.value !== current) {
      atom.value = current;
    }
  };

  $el.on('change', handler);
  ctx.trackCleanup(() => $el.off('change', handler));

  // Atom → DOM
  const fx = effect(() => {
    state.flags |= BindingFlags.SyncingToDom;
    const val = !!atom.value;
    if (el.checked !== val) {
      el.checked = val;
      if (debug.enabled) debug.domUpdated($el, 'checked', val);
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

export function bindEvents(ctx: BindingContext, eventMap: EventBindingMap): void {
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
    const ctx = createContext(this);

    // Apply bindings through focused handlers
    if (options.text !== undefined) bindText(ctx, options.text);
    if (options.html !== undefined) bindHtml(ctx, options.html);
    if (options.class) bindClass(ctx, options.class);
    if (options.css) bindCss(ctx, options.css);
    if (options.attr) bindAttr(ctx, options.attr);
    if (options.prop) bindProp(ctx, options.prop);
    if (options.show !== undefined) bindVisibility(ctx, options.show, false, 'show');
    if (options.hide !== undefined) bindVisibility(ctx, options.hide, true, 'hide');
    if (options.val !== undefined) bindVal(ctx, options.val);
    if (options.checked !== undefined) bindChecked(ctx, options.checked);
    if (options.on) bindEvents(ctx, options.on);
  });
};
