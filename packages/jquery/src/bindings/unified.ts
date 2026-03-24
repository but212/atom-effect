import { computed, effect, isAtom, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { applyInputBinding } from '@/bindings/input-binding';
import {
  DANGEROUS_PROPS,
  ERROR_MESSAGES,
  LOG_PREFIXES,
  URL_PROPS,
  VALID_INPUT_TAGS,
} from '@/constants';
import {
  type BindingDebugType,
  registerMapEffect,
  registerReactiveEffect,
} from '@/core/effect-factory';
import { INTERNAL_HANDLER } from '@/core/jquery-patch';
import { registry } from '@/core/registry';
import type {
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

import { hasOwn } from '@/utils';
import { isDangerousCssValue, isDangerousUrl, sanitizeHtml } from '@/utils/sanitize';

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
  import('@but212/atom-effect').ReadonlyAtom<string>,
  import('@but212/atom-effect').ComputedAtom<string>
>();

function getSanitizedHtml(
  source: import('@but212/atom-effect').ReadonlyAtom<string>
): import('@but212/atom-effect').ComputedAtom<string> {
  let cached = htmlSanitizeCache.get(source);
  if (!cached) {
    cached = computed(() => sanitizeHtml(source.value));
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
  value: ReactiveValue<T>,
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
export function bindHtml(ctx: BindingContext, value: ReactiveValue<string>): void {
  const el = ctx.el;

  const reactiveSource = isAtom(value)
    ? getSanitizedHtml(value as import('@but212/atom-effect').ReadonlyAtom<string>)
    : value;

  registerReactiveEffect(
    el,
    reactiveSource,
    (sanitized) => {
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
  classMap: Record<string, ReactiveValue<boolean>>
): void {
  const el = ctx.el;
  registerMapEffect(
    el,
    classMap,
    (states: Record<string, boolean>) => {
      for (const className in states) {
        const val = states[className];
        const tokens = className.trim().split(/\s+/).filter(Boolean);
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

  registry.trackEffect(
    el,
    effect(
      () => {
        for (const prop in cssMap) {
          if (hasOwn.call(cssMap, prop)) {
            const val = cssMap[prop]!;
            const camel = getCamelCase(prop);
            const [source, unit] = Array.isArray(val) ? val : ([val, ''] as const);

            // Access the value to establish dependency
            const current = isAtom(source)
              ? (source as import('@but212/atom-effect').ReadonlyAtom<unknown>).value
              : source;

            untracked(() => {
              const strVal = unit ? String(current) + unit : String(current);
              if (!isDangerousCssValue(strVal)) {
                if (style[camel] !== strVal) {
                  style[camel] = strVal;
                }
              }
            });
          }
        }
      },
      { name: 'css' }
    )
  );
}

/**
 * Binds DOM attributes with security guards and primitive value constraints.
 */
export function bindAttr(
  ctx: BindingContext,
  attrMap: Record<string, ReactiveValue<PrimitiveValue>>
): void {
  const el = ctx.el;

  // Filter out dangerous attributes once at registration time
  const safeMap: Record<string, ReactiveValue<PrimitiveValue>> = {};
  for (const name in attrMap) {
    if (hasOwn.call(attrMap, name)) {
      if (name.toLowerCase().startsWith('on')) {
        console.warn(
          `${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_EVENT_HANDLER(name)}`
        );
        continue;
      }
      safeMap[name] = attrMap[name]!;
    }
  }

  registerMapEffect(
    el,
    safeMap,
    (states: Record<string, PrimitiveValue>) => {
      for (const name in states) {
        const v = states[name] as PrimitiveValue;
        const lowerName = name.toLowerCase();
        const isAria = lowerName.startsWith('aria-');

        if (v == null || (v === false && !isAria)) {
          el.removeAttribute(name);
          continue;
        }

        const newVal = v === true ? (isAria ? 'true' : name) : String(v);
        if (isDangerousUrl(name, newVal)) {
          console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_PROTOCOL(name)}`);
          continue;
        }

        if (el.getAttribute(name) !== newVal) {
          el.setAttribute(name, newVal);
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
  propMap: Record<string, ReactiveValue<unknown>>
): void {
  const el = ctx.el as unknown as Record<string, unknown>;

  // Filter out dangerous properties once at registration time
  const safeMap: Record<string, ReactiveValue<unknown>> = {};
  for (const name in propMap) {
    if (hasOwn.call(propMap, name)) {
      if (name.toLowerCase().startsWith('on')) {
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
    }
  }

  registerMapEffect(
    ctx.el,
    safeMap,
    (states: Record<string, unknown>) => {
      for (const name in states) {
        const val = states[name];
        const lowerName = name.toLowerCase();
        if (URL_PROPS.has(lowerName) && typeof val === 'string' && isDangerousUrl(name, val)) {
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
  ctx: BindingContext,
  condition: ReactiveValue<boolean>,
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
