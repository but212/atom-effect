import { computed, effect, isAtom, type ReadonlyAtom, untracked } from '@but212/atom-effect';

import $ from 'jquery';
import { applyInputBinding } from '@/bindings/input-binding';
import { DANGEROUS_PROPS, ERROR_MESSAGES, LOG_PREFIXES, VALID_INPUT_TAGS } from '@/constants';
import { registerMapEffect, registerReactiveEffect } from '@/core/effect-factory';
import { INTERNAL_HANDLER } from '@/core/jquery-patch';
import { registry } from '@/core/registry';
import type {
  AsyncReactiveValue,
  BindingContext,
  BindingOptions,
  CssValue,
  PrimitiveValue,
  ReactiveValue,
  ValOptions,
  WritableAtom,
} from '@/types';
import { hasOwn, isPromise } from '@/utils';
import { debug } from '@/utils/debug';

import {
  DANGEROUS_PROTOCOL_RE,
  isDangerousCssValue,
  sanitizeHtml,
  URL_ATTRS,
} from '@/utils/sanitize';

// Cache for CSS property camelization to avoid repeated regex overhead.
// Uses Map instead of a plain object to avoid prototype pollution risk and
// for clearer semantics — CSS property names are a small, finite set so the
// cache is effectively bounded in practice.
const camelCache = new Map<string, string>();
function getCamelCase(prop: string): string {
  let cached = camelCache.get(prop);
  if (cached !== undefined) return cached;

  cached = prop.includes('-') ? prop.replace(/-./g, (m) => m[1]!.toUpperCase()) : prop;
  camelCache.set(prop, cached);
  return cached;
}

/**
 * Cache for sanitized versions of reactive strings.
 * Ensures that if 100 elements are bound to the same atom, sanitizeHtml() is
 * called only once per update instead of 100 times.
 */
const htmlSanitizeCache = new WeakMap<
  ReadonlyAtom<string | Promise<string>>,
  ReadonlyAtom<string | Promise<string>>
>();

function getSanitizedHtml(
  source: ReadonlyAtom<string | Promise<string>>
): ReadonlyAtom<string | Promise<string>> {
  let cached = htmlSanitizeCache.get(source);
  if (!cached) {
    cached = computed(() => {
      const val = source.value;
      if (isPromise(val)) {
        return val.then((v: string) => sanitizeHtml(v));
      }
      return sanitizeHtml(val);
    });
    htmlSanitizeCache.set(source, cached);
  }
  return cached;
}

// ============================================================================
// One-Way Binding Handlers (Atom → DOM)
// ============================================================================

/**
 * Updates element text content.
 */
export function bindText<T = unknown>(
  { el }: BindingContext,
  value: AsyncReactiveValue<T>,
  formatter?: (val: T) => string
): void {
  registerReactiveEffect(
    el,
    value,
    (val) => {
      const text = formatter ? formatter(val) : String(val ?? '');
      if (el.textContent !== text) el.textContent = text;
    },
    'text'
  );
}

/**
 * Updates element inner HTML with XSS sanitization.
 */
export function bindHtml({ el }: BindingContext, value: AsyncReactiveValue<string>): void {
  const source = isAtom(value)
    ? getSanitizedHtml(value as ReadonlyAtom<string | Promise<string>>)
    : value;

  registerReactiveEffect(
    el,
    source,
    (val) => {
      const html = source === value ? sanitizeHtml(val) : val;
      if (el.innerHTML !== html) {
        registry.cleanupDescendants(el);
        el.innerHTML = html;
      }
    },
    'html'
  );
}

/**
 * Toggles multiple CSS classes based on reactive boolean conditions.
 */
export function bindClass(
  { el }: BindingContext,
  classMap: Record<string, AsyncReactiveValue<boolean>>
): void {
  const tokenMap: Record<string, string[]> = {};
  for (const k in classMap) {
    if (hasOwn.call(classMap, k)) {
      const trimmed = k.trim();
      // Optimization: avoid regex for simple single-class keys
      tokenMap[k] = trimmed.indexOf(' ') === -1 ? [trimmed] : trimmed.split(/\s+/).filter(Boolean);
    }
  }

  registerMapEffect(
    el,
    classMap,
    (states) => {
      for (const k in states) {
        const tokens = tokenMap[k]!;
        if (states[k]) {
          el.classList.add(...tokens);
        } else {
          el.classList.remove(...tokens);
        }
      }
    },
    'class'
  );
}

/**
 * Updates multiple CSS style properties.
 */
export function bindCss({ el }: BindingContext, cssMap: Record<string, CssValue>): void {
  const style = el.style as unknown as Record<string, string | null>;
  const reactiveMap: Record<string, ReactiveValue<unknown>> = {};
  const meta: Record<string, { camel: string; unit: string }> = {};

  for (const p in cssMap) {
    if (hasOwn.call(cssMap, p)) {
      const val = cssMap[p]!;
      const [src, unit] = Array.isArray(val) ? val : ([val, ''] as const);
      reactiveMap[p] = src;
      meta[p] = { camel: getCamelCase(p), unit };
    }
  }

  registerMapEffect(
    el,
    reactiveMap,
    (states) => {
      for (const p in states) {
        const m = meta[p]!;
        const val = states[p];
        const str = m.unit ? `${val}${m.unit}` : String(val);
        const camel = m.camel;
        if (!isDangerousCssValue(str) && style[camel] !== str) {
          style[camel] = str;
        }
      }
    },
    'css'
  );
}

/**
 * Binds DOM attributes with security guards and primitive value constraints.
 */
export function bindAttr(
  { el }: BindingContext,
  attrMap: Record<string, AsyncReactiveValue<PrimitiveValue>>
): void {
  const safeMap: Record<string, AsyncReactiveValue<PrimitiveValue>> = {};
  const metaMap: Record<string, { isAria: boolean; isUrl: boolean }> = {};
  const cache: Record<string, string | null> = {};

  for (const name in attrMap) {
    if (!hasOwn.call(attrMap, name)) continue;
    const lower = name.toLowerCase();
    if (lower.startsWith('on')) {
      console.warn(
        `${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_EVENT_HANDLER(name)}`
      );
      continue;
    }
    safeMap[name] = attrMap[name]!;
    metaMap[name] = { isAria: lower.startsWith('aria-'), isUrl: URL_ATTRS.has(lower) };
    cache[name] = el.getAttribute(name);
  }

  registerMapEffect(
    el,
    safeMap,
    (states) => {
      for (const name in states) {
        const m = metaMap[name]!;
        const val = states[name] as PrimitiveValue;

        if (val == null || (val === false && !m.isAria)) {
          if (cache[name] !== null) el.removeAttribute(name);
          cache[name] = null;
          continue;
        }

        const newVal = val === true ? (m.isAria ? 'true' : name) : String(val);
        if (m.isUrl && DANGEROUS_PROTOCOL_RE.test(newVal)) {
          console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_PROTOCOL(name)}`);
          continue;
        }

        if (cache[name] !== newVal) {
          el.setAttribute(name, newVal);
          cache[name] = newVal;
        }
      }
    },
    'attr'
  );
}

/**
 * Binds DOM properties. Uses strict property write guards and security filters.
 */
export function bindProp(
  ctx: BindingContext,
  propMap: Record<string, AsyncReactiveValue<unknown>>
): void {
  const el = ctx.el as unknown as Record<string, unknown>;
  const safeMap: Record<string, AsyncReactiveValue<unknown>> = {};
  const metaMap: Record<string, { isUrl: boolean }> = {};

  for (const name in propMap) {
    if (!hasOwn.call(propMap, name)) continue;
    const lower = name.toLowerCase();
    if (lower.startsWith('on') || DANGEROUS_PROPS.has(name)) {
      console.warn(
        `${LOG_PREFIXES.BINDING} ${
          lower.startsWith('on')
            ? ERROR_MESSAGES.SECURITY.BLOCKED_EVENT_HANDLER(name)
            : ERROR_MESSAGES.SECURITY.BLOCKED_PROP(name)
        }`
      );
      continue;
    }
    safeMap[name] = propMap[name]!;
    metaMap[name] = { isUrl: URL_ATTRS.has(lower) };
  }

  registerMapEffect(
    ctx.el,
    safeMap,
    (states) => {
      for (const name in states) {
        const val = states[name];
        if (metaMap[name]!.isUrl && typeof val === 'string' && DANGEROUS_PROTOCOL_RE.test(val)) {
          console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_PROTOCOL(name)}`);
          continue;
        }
        if (el[name] !== val) {
          el[name] = val;
        }
      }
    },
    'prop'
  );
}

/**
 * Handles visibility (display: none) toggle.
 */
export function bindVisibility(
  { el }: BindingContext,
  condition: AsyncReactiveValue<boolean>,
  invert: boolean
): void {
  const show = el.style.display === 'none' ? '' : el.style.display;
  registerReactiveEffect(
    el,
    condition,
    (val) => {
      const target = invert !== !!val ? show : 'none';
      if (el.style.display !== target) el.style.display = target;
    },
    invert ? 'hide' : 'show'
  );
}

/**
 * Two-way value binding with full feature parity to $.fn.atomVal.
 */
export function bindVal(
  ctx: BindingContext,
  atom: WritableAtom<unknown>,
  options: ValOptions<unknown> = {}
): void {
  const tag = ctx.el.tagName.toLowerCase();
  if (!VALID_INPUT_TAGS.has(tag)) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.INVALID_INPUT_ELEMENT(tag)}`);
    return;
  }
  const { fx, cleanup } = applyInputBinding($(ctx.el), atom, options);
  registry.trackEffect(ctx.el, fx);
  ctx.trackCleanup(cleanup);
}

/**
 * Two-way binding for checkbox/radio checked state.
 */
export function bindChecked(ctx: BindingContext, atom: WritableAtom<boolean>): void {
  const el = ctx.el as HTMLInputElement;
  const $el = $(el);

  const handler = () => {
    if (atom.peek() !== el.checked) {
      atom.value = el.checked;
      if (el.type === 'radio' && el.checked && el.name) {
        (el.form ? $(el.form) : $(document))
          .find(`input[type="radio"][name="${el.name.replace(/"/g, '\\"')}"]`)
          .not(el)
          .trigger('change.atomRadioSync');
      }
    }
  };
  (handler as unknown as Record<symbol, boolean>)[INTERNAL_HANDLER] = true;

  $el.on('change change.atomRadioSync', handler);
  ctx.trackCleanup(() => $el.off('change change.atomRadioSync', handler));

  registry.trackEffect(
    el,
    effect(() => {
      const val = !!atom.value;
      untracked(() => {
        if (el.checked !== val) {
          el.checked = val;
          debug.domUpdated(LOG_PREFIXES.BINDING, el, 'checked', val);
        }
      });
    })
  );
}

// ============================================================================
// Event Binding Handler
// ============================================================================

export function bindEvents(ctx: BindingContext, eventMap: NonNullable<BindingOptions['on']>): void {
  const $el = $(ctx.el);
  $el.on(eventMap);
  ctx.trackCleanup(() => $el.off(eventMap));
}

/**
 * Binds a single event handler using jQuery's event system for compatibility.
 */
export function bindOn(
  { el, trackCleanup }: BindingContext,
  event: string,
  handler: (e: JQuery.TriggeredEvent) => void
): void {
  const $el = $(el);
  $el.on(event, handler);
  trackCleanup(() => $el.off(event, handler));
}

/**
 * Disposes all reactive bindings on an element and its descendants.
 */
export function bindUnbind(el: HTMLElement): void {
  registry.cleanupTree(el);
}
