import { effect } from '@but212/atom-effect';
import $ from 'jquery';
import { DANGEROUS_PROPS, ERROR_MESSAGES, LOG_PREFIXES } from './constants';
import { debug } from './debug';
import { registerReactiveEffect } from './effect-factory';
import { applyInputBinding } from './input-binding';
import { registry } from './registry';
import type {
  BindingContext,
  BindingOptions,
  CssValue,
  PrimitiveValue,
  ReactiveValue,
  ValOptions,
  WritableAtom,
} from './types';
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
  return {
    $el: $(el),
    el,
    trackCleanup: (fn) => registry.trackCleanup(el, fn),
  };
}

// ============================================================================
// One-Way Binding Handlers (Atom → DOM)
// ============================================================================

/**
 * Updates element text content. Decoupled from generic T for flexibility with any reactive source.
 */
export function bindText<T = unknown>(
  ctx: BindingContext,
  value: ReactiveValue<T>,
  formatter?: (val: T) => string
): void {
  const el = ctx.el;
  registerReactiveEffect(
    el,
    value,
    (val) => {
      const newVal = formatter ? formatter(val) : typeof val === 'string' ? val : String(val ?? '');
      // Guard against redundant DOM writes which trigger browser reflows
      if (el.textContent !== newVal) {
        el.textContent = newVal;
      }
    },
    'text'
  );
}

/**
 * Updates element inner HTML with XSS sanitization.
 */
export function bindHtml(ctx: BindingContext, value: ReactiveValue<string>): void {
  const el = ctx.el;
  registerReactiveEffect(
    el,
    value,
    (val) => {
      const newVal = String(val ?? '');
      const sanitized = sanitizeHtml(newVal);

      if (sanitized !== newVal) {
        console.warn(`${LOG_PREFIXES.BIND} ${ERROR_MESSAGES.UNSAFE_CONTENT}`);
      }

      // Guard against redundant DOM writes which destroy/recreate subtrees
      if (el.innerHTML !== sanitized) {
        el.innerHTML = sanitized;
      }
    },
    'html'
  );
}

/**
 * Toggles multiple CSS classes based on reactive boolean conditions.
 */
export function bindClass(
  ctx: BindingContext,
  classMap: Record<string, ReactiveValue<boolean>>
): void {
  for (const className in classMap) {
    registerReactiveEffect(
      ctx.el,
      classMap[className]!,
      (val) => {
        ctx.el.classList.toggle(className, !!val);
      },
      `class.${className}`
    );
  }
}

/**
 * Updates multiple CSS style properties. Supports units (e.g., [source, 'px']).
 */
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
          console.warn(`${LOG_PREFIXES.BIND} ${ERROR_MESSAGES.BLOCKED_DANGEROUS_VALUE(prop)}`);
          return;
        }
        style[camel] = strVal;
      },
      `css.${prop}`
    );
  }
}

/**
 * Binds DOM attributes with security guards and primitive value constraints.
 */
export function bindAttr(
  ctx: BindingContext,
  attrMap: Record<string, ReactiveValue<PrimitiveValue>>
): void {
  const el = ctx.el;
  for (const name in attrMap) {
    // Block event handler attributes (on*) to prevent inline JS injection
    const c0 = name.charCodeAt(0);
    if ((c0 === 111 || c0 === 79) && (name.charCodeAt(1) === 110 || name.charCodeAt(1) === 78)) {
      console.warn(`${LOG_PREFIXES.BIND} ${ERROR_MESSAGES.BLOCKED_EVENT_HANDLER(name)}`);
      continue;
    }

    registerReactiveEffect(
      el,
      attrMap[name]!,
      (v) => {
        if (v === null || v === undefined || v === false) {
          el.removeAttribute(name);
          return;
        }
        const newVal = v === true ? name : String(v);
        if (isDangerousUrl(name, newVal)) {
          console.warn(`${LOG_PREFIXES.BIND} ${ERROR_MESSAGES.BLOCKED_PROTOCOL(name)}`);
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

/**
 * Binds DOM properties. Uses strict property write guards.
 */
export function bindProp(
  ctx: BindingContext,
  propMap: Record<string, ReactiveValue<unknown>>
): void {
  const el = ctx.el as unknown as Record<string, unknown>;
  for (const name in propMap) {
    // Block dangerous DOM properties that can inject raw HTML (e.g., innerHTML)
    if (DANGEROUS_PROPS.includes(name as (typeof DANGEROUS_PROPS)[number])) {
      console.warn(`${LOG_PREFIXES.BIND} ${ERROR_MESSAGES.BLOCKED_DANGEROUS_PROP(name)}`);
      continue;
    }

    registerReactiveEffect(
      ctx.el,
      propMap[name]!,
      (val) => {
        // Redundancy check specifically for DOM properties
        if (el[name] !== val) {
          el[name] = val;
        }
      },
      `prop.${name}`
    );
  }
}

/**
 * Handlers visibility (display: none) toggle.
 */
export function bindVisibility(
  ctx: BindingContext,
  condition: ReactiveValue<boolean>,
  invert: boolean
): void {
  const el = ctx.el;
  const label = invert ? 'hide' : 'show';
  registerReactiveEffect(
    el,
    condition,
    (val) => {
      const visible = invert !== !!val;
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
  if (tagName !== 'input' && tagName !== 'select' && tagName !== 'textarea') {
    console.warn(`[atomBind] Val binding used on non-input element <${tagName}>.`);
    return;
  }
  const isArr = Array.isArray(cfg);
  const { fx, cleanup } = applyInputBinding(ctx.$el, isArr ? cfg[0] : cfg, isArr ? cfg[1] : {});

  registry.trackEffect(ctx.el, fx);
  ctx.trackCleanup(cleanup);
}

/**
 * Two-way binding for checkbox/radio checked state.
 */
export function bindChecked(ctx: BindingContext, atom: WritableAtom<boolean>): void {
  const el = ctx.el as HTMLInputElement;
  const $el = ctx.$el;

  // DOM → Atom (jQuery events for .trigger() compatibility)
  // Note: el.checked = x does not fire 'change', so no re-entrancy guard is needed.
  const handler = () => {
    const current = el.checked;
    if (atom.value !== current) {
      atom.value = current;
    }
  };

  $el.on('change', handler);
  ctx.trackCleanup(() => $el.off('change', handler));

  // Atom → DOM
  const fx = effect(() => {
    const val = !!atom.value;
    if (el.checked !== val) {
      el.checked = val;
      if (debug.enabled) debug.domUpdated($el, 'checked', val);
    }
  });
  registry.trackEffect(el, fx);
}

// ============================================================================
// Event Binding Handler
// ============================================================================

/**
 * Event handler map type for atomBind({ on: ... })
 */
type EventBindingMap = {
  [eventName: string]: (e: JQuery.Event) => void;
};

export function bindEvents(ctx: BindingContext, eventMap: EventBindingMap): void {
  for (const name in eventMap) {
    const handler = eventMap[name]!;
    if (typeof handler !== 'function') continue;
    bindOn(ctx, name, handler);
  }
}

/**
 * Binds a single event handler using jQuery's event system for compatibility.
 * Optimized to avoid creating jQuery wrapper objects repeatedly during setup/teardown.
 */
export function bindOn(
  ctx: BindingContext,
  event: string,
  handler: (e: JQuery.Event) => void
): void {
  const $el = ctx.$el;
  $el.on(event, handler);
  ctx.trackCleanup(() => $el.off(event, handler));
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Extends jQuery with atom-based data binding capabilities.
 * Synchronizes multiple element states with reactive atoms in a single batch call.
 */
$.fn.atomBind = function (options: BindingOptions): JQuery {
  return this.each(function () {
    const ctx = createContext(this);

    // Apply bindings through focused handlers
    if (options.text !== undefined) bindText(ctx, options.text);
    if (options.html !== undefined) bindHtml(ctx, options.html);
    if (options.class) bindClass(ctx, options.class);
    if (options.css) bindCss(ctx, options.css);
    if (options.attr) bindAttr(ctx, options.attr);
    if (options.prop) bindProp(ctx, options.prop);
    if (options.show !== undefined) bindVisibility(ctx, options.show, false);
    if (options.hide !== undefined) bindVisibility(ctx, options.hide, true);
    if (options.val !== undefined) bindVal(ctx, options.val);
    if (options.checked !== undefined) bindChecked(ctx, options.checked);
    if (options.on) bindEvents(ctx, options.on);
  });
};
