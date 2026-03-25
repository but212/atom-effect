import { computed, effect, isAtom, type ReadonlyAtom, untracked } from '@but212/atom-effect';

import $ from 'jquery';
import { applyInputBinding } from '@/bindings/input-binding';
import { DANGEROUS_PROPS, ERROR_MESSAGES, LOG_PREFIXES, VALID_INPUT_TAGS } from '@/constants';
import {
  type BindingDebugType,
  registerMapEffect,
  registerReactiveEffect,
} from '@/core/effect-factory';
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
import { debug } from '@/utils/debug';

export type { BindingContext };

import { hasOwn, isPromise } from '@/utils';

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
// Binding Context Factory
// ============================================================================

export function createContext(el: HTMLElement): BindingContext {
  return {
    el,
    trackCleanup: (fn) => registry.trackCleanup(el, fn),
  };
}

// ============================================================================
// One-Way Binding Handlers (Atom → DOM)
// ============================================================================

/**
 * Updates element text content.
 */
export function bindText<T = unknown>(
  ctx: BindingContext,
  value: AsyncReactiveValue<T>,
  formatter?: (val: T) => string
): void {
  const el = ctx.el;
  registerReactiveEffect(
    el,
    value,
    (val) => {
      const newVal = formatter ? formatter(val) : typeof val === 'string' ? val : String(val ?? '');
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
export function bindHtml(ctx: BindingContext, value: AsyncReactiveValue<string>): void {
  const el = ctx.el;

  const reactiveSource = isAtom(value)
    ? getSanitizedHtml(value as ReadonlyAtom<string | Promise<string>>)
    : value;

  registerReactiveEffect(
    el,
    reactiveSource,
    (val) => {
      const sanitized = reactiveSource === value ? sanitizeHtml(val) : val;
      if (el.innerHTML !== sanitized) {
        registry.cleanupDescendants(el);
        el.innerHTML = sanitized;
      }
    },
    'html'
  );
}

/**
 * Toggles multiple CSS classes based on reactive boolean conditions.
 * Grouped into a single effect per element to reduce subscription overhead.
 */
export function bindClass(
  ctx: BindingContext,
  classMap: Record<string, AsyncReactiveValue<boolean>>
): void {
  const el = ctx.el;

  // Pre-calculate whitespace-split tokens for each class name once at
  // registration to avoid repeated string manipulation in the update loop.
  const tokenMap: Record<string, string[]> = {};
  for (const className in classMap) {
    if (hasOwn.call(classMap, className)) {
      tokenMap[className] = className.trim().split(/\s+/).filter(Boolean);
    }
  }

  registerMapEffect(
    el,
    classMap,
    (states: Record<string, boolean>) => {
      for (const className in states) {
        const val = states[className];
        const tokens = tokenMap[className]!;
        if (val) {
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
 * Grouped into a single effect per element to reduce subscription overhead.
 */
export function bindCss(ctx: BindingContext, cssMap: Record<string, CssValue>): void {
  const el = ctx.el;
  const style = el.style as unknown as Record<string, string>;

  // Metadata cache: pre-calculate camelCase names and extraction logic
  // to minimize overhead inside the reactive loop.
  const reactiveMap: Record<string, ReactiveValue<unknown>> = {};
  const meta: Record<string, { camel: string; unit: string }> = {};

  for (const prop in cssMap) {
    if (hasOwn.call(cssMap, prop)) {
      const val = cssMap[prop]!;
      const [source, unit] = Array.isArray(val) ? val : ([val, ''] as const);

      reactiveMap[prop] = source;
      meta[prop] = {
        camel: getCamelCase(prop),
        unit,
      };
    }
  }

  registerMapEffect(
    el,
    reactiveMap,
    (states: Record<string, unknown>) => {
      for (const prop in states) {
        const current = states[prop];
        const { camel, unit } = meta[prop]!;
        const strVal = unit ? String(current) + unit : String(current);

        if (!isDangerousCssValue(strVal)) {
          if (style[camel] !== strVal) {
            style[camel] = strVal;
          }
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
  ctx: BindingContext,
  attrMap: Record<string, AsyncReactiveValue<PrimitiveValue>>
): void {
  const el = ctx.el;

  // Metadata cache for performance: pre-calculate attribute properties once
  // at registration time to avoid repeated string operations in the update loop.
  const safeMap: Record<string, AsyncReactiveValue<PrimitiveValue>> = {};

  const metadataMap: Record<string, { isAria: boolean; isUrl: boolean }> = {};

  for (const name in attrMap) {
    if (hasOwn.call(attrMap, name)) {
      const lower = name.toLowerCase();
      if (lower.startsWith('on')) {
        console.warn(
          `${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_EVENT_HANDLER(name)}`
        );
        continue;
      }
      safeMap[name] = attrMap[name]!;
      metadataMap[name] = {
        isAria: lower.startsWith('aria-'),
        isUrl: URL_ATTRS.has(lower),
      };
    }
  }

  // Last written value cache to avoid expensive DOM reads (getAttribute) during updates.
  // Using JS memory is significantly faster than crossing the DOM boundary in benchmarks.
  const valueCache: Record<string, string | null> = {};
  for (const name in safeMap) {
    valueCache[name] = el.getAttribute(name);
  }

  registerMapEffect(
    el,
    safeMap,
    (states: Record<string, PrimitiveValue>) => {
      for (const name in states) {
        const value = states[name] as PrimitiveValue;
        const meta = metadataMap[name]!;
        const isAria = meta.isAria;

        // Skip removal and dangerous checks for null/undefined/false (except ARIA)
        if (value == null || (value === false && !isAria)) {
          if (valueCache[name] !== null) {
            el.removeAttribute(name);
            valueCache[name] = null;
          }
          continue;
        }

        // Standardize value based on attribute type
        const newVal = value === true ? (isAria ? 'true' : name) : String(value);

        // Security check: Only run regex on URL-bearing attributes
        if (meta.isUrl && DANGEROUS_PROTOCOL_RE.test(newVal)) {
          console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_PROTOCOL(name)}`);
          continue;
        }

        // JS cache check: Only write to DOM if value changed since last write/registration.
        // This bypasses the expensive getAttribute call identified as a bottleneck.
        if (valueCache[name] !== newVal) {
          el.setAttribute(name, newVal);
          valueCache[name] = newVal;
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

  // Metadata cache for performance: pre-calculate whether a property carries a
  // URL once at registration time to avoid repeated string operations.
  const safeMap: Record<string, AsyncReactiveValue<unknown>> = {};

  const metadataMap: Record<string, { isUrl: boolean }> = {};

  for (const name in propMap) {
    if (hasOwn.call(propMap, name)) {
      const lower = name.toLowerCase();
      if (lower.startsWith('on')) {
        console.warn(
          `${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_EVENT_HANDLER(name)}`
        );
        continue;
      }
      if (DANGEROUS_PROPS.has(name)) {
        console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_PROP(name)}`);
        continue;
      }
      safeMap[name] = propMap[name]!;
      metadataMap[name] = {
        isUrl: URL_ATTRS.has(lower),
      };
    }
  }

  registerMapEffect(
    ctx.el,
    safeMap,
    (states: Record<string, unknown>) => {
      for (const name in states) {
        const val = states[name];
        const isUrl = metadataMap[name]!.isUrl;

        // Security check: Only run regex on URL-bearing properties
        if (isUrl && typeof val === 'string' && DANGEROUS_PROTOCOL_RE.test(val)) {
          console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_PROTOCOL(name)}`);
          continue;
        }

        // Write guard: only update if the value has actually changed
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
  ctx: BindingContext,
  condition: AsyncReactiveValue<boolean>,
  invert: boolean
): void {
  const el = ctx.el;
  const label: BindingDebugType = invert ? 'hide' : 'show';
  const originalDisplay = el.style.display;
  const showDisplay = originalDisplay === 'none' ? '' : originalDisplay;

  registerReactiveEffect(
    el,
    condition,
    (val) => {
      const target = invert !== !!val ? showDisplay : 'none';
      if (el.style.display !== target) {
        el.style.display = target;
      }
    },
    label
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
  const tagName = ctx.el.tagName.toLowerCase();
  if (!VALID_INPUT_TAGS.has(tagName)) {
    console.warn(
      `${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.INVALID_INPUT_ELEMENT(tagName)}`
    );
    return;
  }
  // Wrap raw element only when needed for complex input binding logic
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
  const isRadio = el.type === 'radio';

  const handler = () => {
    const current = el.checked;
    // peek(): equality check in an event handler must not register a dependency.
    if (atom.peek() !== current) {
      atom.value = current;
      if (isRadio && current && el.name) {
        const escapedName = el.name.replace(/"/g, '\\"');
        const $scope = el.form ? $(el.form) : $(document);
        $scope
          .find(`input[type="radio"][name="${escapedName}"]`)
          .not(el)
          .trigger('change.atomRadioSync');
      }
    }
  };
  (handler as unknown as Record<symbol, true>)[INTERNAL_HANDLER] = true;

  $el.on('change change.atomRadioSync', handler);
  ctx.trackCleanup(() => $el.off('change change.atomRadioSync', handler));

  const fx = effect(() => {
    const val = !!atom.value;
    untracked(() => {
      if (el.checked !== val) {
        el.checked = val;
        if (debug.enabled) debug.domUpdated(LOG_PREFIXES.BINDING, el, 'checked', val);
      }
    });
  });
  registry.trackEffect(el, fx);
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
  ctx: BindingContext,
  event: string,
  handler: (e: JQuery.Event) => void
): void {
  const $el = $(ctx.el);
  $el.on(event, handler);
  ctx.trackCleanup(() => $el.off(event, handler));
}

/**
 * Disposes all reactive bindings on an element and its descendants.
 */
export function bindUnbind(el: HTMLElement): void {
  registry.cleanupTree(el);
}
