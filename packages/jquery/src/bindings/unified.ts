import { computed, effect, isAtom, type ReadonlyAtom, untracked } from '@but212/atom-effect';

import $ from 'jquery';
import { applyInputBinding } from '@/bindings/input-binding';
import { DANGEROUS_PROPS, ERROR_MESSAGES, LOG_PREFIXES, VALID_INPUT_TAGS } from '@/constants';
import { registerMapEffect, registerReactiveEffect } from '@/core/effect-factory';
import { INTERNAL_HANDLER } from '@/core/jquery-patch';
import { registry } from '@/core/registry';
import type {
  AsyncReactiveValue,
  BindingOptions,
  CssValue,
  PrimitiveValue,
  ReactiveValue,
  ValOptions,
  WritableAtom,
} from '@/types';
import { hasOwn, isPromise } from '@/utils';
import { debug } from '@/utils/debug';

import { isDangerousCssValue, isDangerousUrl, sanitizeHtml } from '@/utils/sanitize';

/** Optimization: Pre-caches camelCased versions of CSS property names. */
const camelCache = new Map<string, string>();
function getCamelCase(prop: string): string {
  let cached = camelCache.get(prop);
  if (cached !== undefined) return cached;

  cached = prop.includes('-') ? prop.replace(/-./g, (m) => m[1]!.toUpperCase()) : prop;
  camelCache.set(prop, cached);
  return cached;
}

/**
 * Optimization: Caches sanitization computed-atoms keyed by the source identity.
 * This prevents creating multiple sanitizing effects for the same source atom used
 * across different DOM nodes.
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

/**
 * Security: Blocks 'on*' event attributes and dangerous properties like innerHTML
 * from being bound as standard attributes/props to prevent XSS.
 */
function isSafeBinding(name: string, isProp: boolean): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith('on')) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_EVENT_HANDLER(name)}`);
    return false;
  }
  if (isProp && DANGEROUS_PROPS.has(name)) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_PROP(name)}`);
    return false;
  }
  return true;
}

/** Syncs element text content with a reactive source. */
export function bindText<T = unknown>(
  el: HTMLElement,
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
 * Binds sanitized HTML content to an element.
 * Note: Descendant bindings are automatically cleaned up before re-writing innerHTML.
 */
export function bindHtml(el: HTMLElement, value: AsyncReactiveValue<string>): void {
  const source = isAtom(value)
    ? getSanitizedHtml(value as ReadonlyAtom<string | Promise<string>>)
    : value;

  let lastHtml: string | null = null;

  registerReactiveEffect(
    el,
    source,
    (val) => {
      const html = source === value ? sanitizeHtml(val) : val;
      if (lastHtml !== html) {
        registry.cleanupDescendants(el);
        el.innerHTML = html;
        lastHtml = html;
      }
    },
    'html'
  );
}

/**
 * Manages element classes reactively using a boolean map.
 * Case handling: Correctly removes tokens only if no other active class definition in the map requires them.
 */
export function bindClass(
  el: HTMLElement,
  classMap: Record<string, AsyncReactiveValue<boolean>>
): void {
  const tokenMap: Record<string, string[]> = {};
  const prevStates: Record<string, boolean> = {};

  for (const k in classMap) {
    if (hasOwn.call(classMap, k)) {
      const trimmed = k.trim();
      tokenMap[k] = /\s/.test(trimmed) ? trimmed.split(/\s+/).filter(Boolean) : [trimmed];
    }
  }

  registerMapEffect(
    el,
    classMap,
    (states) => {
      for (const k in states) {
        const val = !!states[k];
        if (prevStates[k] === val) continue;

        const tokens = tokenMap[k]!;
        if (val) {
          el.classList.add(...tokens);
        } else {
          for (const token of tokens) {
            let stillNeeded = false;
            // Check if this token is shared with another 'true' entry in the map
            for (const otherK in states) {
              if (otherK !== k && states[otherK] && tokenMap[otherK]!.includes(token)) {
                stillNeeded = true;
                break;
              }
            }
            if (!stillNeeded) el.classList.remove(token);
          }
        }
        prevStates[k] = val;
      }
    },
    'class'
  );
}

/** Reactively updates inline styles while blocking potentially harmful CSS values. */
export function bindCss(el: HTMLElement, cssMap: Record<string, CssValue>): void {
  const style = el.style as unknown as Record<string, string | null>;
  const reactiveMap: Record<string, ReactiveValue<unknown>> = {};
  const meta: Record<string, { camel: string; unit: string }> = {};
  const prevValues: Record<string, string | null> = {};

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

        if (prevValues[p] !== str) {
          if (!isDangerousCssValue(str)) {
            style[camel] = str;
          }
          prevValues[p] = str;
        }
      }
    },
    'css'
  );
}

/**
 * Syncs DOM attributes.
 * Note: Handles specific logic for boolean attributes (like 'disabled')
 * and protocol-validation for URLs (href/src).
 */
export function bindAttr(
  el: HTMLElement,
  attrMap: Record<string, AsyncReactiveValue<PrimitiveValue>>
): void {
  const safeMap: Record<string, AsyncReactiveValue<PrimitiveValue>> = {};
  const metaMap: Record<string, { isAria: boolean }> = {};
  const cache: Record<string, string | null> = {};

  for (const name in attrMap) {
    if (!hasOwn.call(attrMap, name)) continue;
    if (!isSafeBinding(name, false)) continue;

    const lower = name.toLowerCase();
    safeMap[name] = attrMap[name]!;
    metaMap[name] = { isAria: lower.startsWith('aria-') };
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
        if (isDangerousUrl(name, newVal)) {
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

/** Directly maps reactive values to DOM element properties with URL validation. */
export function bindProp(
  el: HTMLElement,
  propMap: Record<string, AsyncReactiveValue<unknown>>
): void {
  const target = el as unknown as Record<string, unknown>;
  const safeMap: Record<string, AsyncReactiveValue<unknown>> = {};
  const prevValues: Record<string, unknown> = {};
  for (const name in propMap) {
    if (!hasOwn.call(propMap, name)) continue;
    if (!isSafeBinding(name, true)) continue;

    safeMap[name] = propMap[name]!;
  }

  registerMapEffect(
    el,
    safeMap,
    (states) => {
      for (const name in states) {
        const val = states[name];
        if (prevValues[name] === val) continue;

        if (typeof val === 'string' && isDangerousUrl(name, val)) {
          console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_PROTOCOL(name)}`);
          continue;
        }

        target[name] = val;
        prevValues[name] = val;
      }
    },
    'prop'
  );
}

/** Toggles display style between 'none' and its original state. */
export function bindVisibility(
  el: HTMLElement,
  condition: AsyncReactiveValue<boolean>,
  invert: boolean
): void {
  let lastDisplay = el.style.display === 'none' ? '' : el.style.display;

  registerReactiveEffect(
    el,
    condition,
    (val) => {
      const isVisible = invert !== !!val;
      if (isVisible) {
        if (el.style.display === 'none') {
          el.style.display = lastDisplay;
        }
      } else if (el.style.display !== 'none') {
        lastDisplay = el.style.display;
        el.style.display = 'none';
      }
    },
    invert ? 'hide' : 'show'
  );
}

/** Entry point for input/value bindings; delegates to the InputBinding engine. */
export function bindVal(
  el: HTMLElement,
  atom: WritableAtom<unknown>,
  options: ValOptions<unknown> = {}
): void {
  const tag = el.tagName.toLowerCase();
  if (!VALID_INPUT_TAGS.has(tag)) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.INVALID_INPUT_ELEMENT(tag)}`);
    return;
  }
  const { fx, cleanup } = applyInputBinding($(el), atom, options);
  registry.trackEffect(el, fx);
  registry.trackCleanup(el, cleanup);
}

/**
 * Requirement: Radio buttons in the same name group don't fire 'change'
 * when they are automatically unchecked by another radio selection.
 * We manually trigger a sync for the rest of the group.
 */
function syncRadioGroup(el: HTMLInputElement): void {
  if (el.type === 'radio' && el.name) {
    (el.form ? $(el.form) : $(document))
      .find(`input[type="radio"][name="${$.escapeSelector(el.name)}"]`)
      .not(el)
      .trigger('change.atomRadioSync');
  }
}

/** Specialized two-way binding for checkbox and radio 'checked' states. */
export function bindChecked(el: HTMLElement, atom: WritableAtom<boolean>): void {
  if (!(el instanceof HTMLInputElement)) {
    console.warn(`${LOG_PREFIXES.BINDING} atomChecked called on non-input element`);
    return;
  }
  const input = el;
  const $el = $(input);

  const handler = () => {
    if (atom.peek() !== input.checked) {
      atom.value = input.checked;
      syncRadioGroup(input);
    }
  };
  (handler as unknown as Record<symbol, boolean>)[INTERNAL_HANDLER] = true;

  $el.on('change change.atomRadioSync', handler);
  registry.trackCleanup(input, () => $el.off('change change.atomRadioSync', handler));

  registry.trackEffect(
    input,
    effect(() => {
      const val = !!atom.value;
      untracked(() => {
        if (input.checked !== val) {
          input.checked = val;
          debug.domUpdated(LOG_PREFIXES.BINDING, input, 'checked', val);
          if (val) syncRadioGroup(input);
        }
      });
    })
  );
}

/** Registers flat event maps with automatic lifecycle cleanup. */
export function bindEvents(el: HTMLElement, eventMap: NonNullable<BindingOptions['on']>): void {
  const $el = $(el);
  $el.on(eventMap);
  registry.trackCleanup(el, () => $el.off(eventMap));
}

/** Registers a single event listener with automatic lifecycle cleanup. */
export function bindOn(
  el: HTMLElement,
  event: string,
  handler: (e: JQuery.TriggeredEvent) => void
): void {
  const $el = $(el);
  $el.on(event, handler);
  registry.trackCleanup(el, () => $el.off(event, handler));
}
