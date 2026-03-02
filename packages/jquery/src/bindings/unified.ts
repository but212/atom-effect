import { computed, effect, isAtom, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import {
  DANGEROUS_PROPS,
  ERROR_MESSAGES,
  LOG_PREFIXES,
  URL_PROPS,
  VALID_INPUT_TAGS,
} from '../constants';
import { debug } from '../utils/debug';
import { type BindingDebugType, registerReactiveEffect } from '../core/effect-factory';
import { applyInputBinding } from '../bindings/input-binding';
import { INTERNAL_HANDLER } from '../core/jquery-patch';
import { registry } from '../core/registry';
import type {
  BindingContext,
  BindingOptions,
  CssValue,
  PrimitiveValue,
  ReactiveValue,
  ValOptions,
  WritableAtom,
} from '../types';

export type { BindingContext };

import { isDangerousCssValue, isDangerousUrl, sanitizeHtml } from '../utils/sanitize';
import { hasOwn } from '../utils';

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
 * Calls `registry.cleanupDescendants` before replacing innerHTML so that any
 * reactive bindings on outgoing child nodes are disposed before they are removed —
 * preventing the MutationObserver auto-cleanup path from firing a redundant cleanup.
 */
export function bindHtml(ctx: BindingContext, value: ReactiveValue<string>): void {
  const el = ctx.el;

  // Optimization: If the source is reactive, use a cached computed atom to
  // ensure sanitization runs exactly once per atom change for all observers.
  const reactiveSource = isAtom(value)
    ? getSanitizedHtml(value as import('@but212/atom-effect').ReadonlyAtom<string>)
    : value;

  registerReactiveEffect(
    el,
    reactiveSource,
    (sanitized) => {
      if (el.innerHTML !== sanitized) {
        // Dispose child bindings before the nodes are removed from the DOM.
        registry.cleanupDescendants(el);
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
    if (hasOwn.call(classMap, className)) {
      const source = classMap[className]!;
      // FIX 1: Support space-separated multiple classes (e.g. Tailwind) without DOMException
      const tokens = className.trim().split(/\s+/).filter(Boolean);

      if (tokens.length > 1) {
        registerReactiveEffect(
          ctx.el,
          source,
          (val) => {
            if (val) {
              ctx.el.classList.add(...tokens);
            } else {
              ctx.el.classList.remove(...tokens);
            }
          },
          `class.${className}`
        );
      } else if (tokens.length === 1) {
        registerReactiveEffect(
          ctx.el,
          source,
          (val) => {
            ctx.el.classList.toggle(tokens[0]!, !!val);
          },
          `class.${className}`
        );
      }
    }
  }
}

/**
 * Updates multiple CSS style properties. Supports units (e.g., [source, 'px']).
 */
export function bindCss(ctx: BindingContext, cssMap: Record<string, CssValue>): void {
  const el = ctx.el;
  const style = el.style as unknown as Record<string, string>;
  for (const prop in cssMap) {
    if (hasOwn.call(cssMap, prop)) {
      const val = cssMap[prop]!;
      const camel = getCamelCase(prop);
      // Destructure the tuple form explicitly so TypeScript can narrow each branch.
      const [source, unit] = Array.isArray(val) ? val : ([val, ''] as const);

      registerReactiveEffect(
        el,
        source,
        (v) => {
          const strVal = unit ? String(v) + unit : String(v);
          if (!isDangerousCssValue(strVal)) {
            style[camel] = strVal;
          }
        },
        `css.${prop}`
      );
    }
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
    if (hasOwn.call(attrMap, name)) {
      const lowerName = name.toLowerCase();
      // Block event handler attributes (on*) to prevent inline JS injection.
      if (lowerName.startsWith('on')) {
        console.warn(
          `${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_EVENT_HANDLER(name)}`
        );
        continue;
      }

      const isAria = lowerName.startsWith('aria-');

      registerReactiveEffect(
        el,
        attrMap[name]!,
        (v) => {
          if (v == null) {
            el.removeAttribute(name);
            return;
          }
          // FIX 3: Preserve boolean 'false' for ARIA attributes instead of removing them.
          if (v === false && !isAria) {
            el.removeAttribute(name);
            return;
          }
          const newVal = v === true ? (isAria ? 'true' : name) : String(v);
          if (isDangerousUrl(name, newVal)) {
            console.warn(
              `${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_PROTOCOL(name)}`
            );
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
}

/**
 * Binds DOM properties. Uses strict property write guards and security filters.
 */
export function bindProp(
  ctx: BindingContext,
  propMap: Record<string, ReactiveValue<unknown>>
): void {
  const el = ctx.el as unknown as Record<string, unknown>;
  for (const name in propMap) {
    if (hasOwn.call(propMap, name)) {
      const lowerName = name.toLowerCase();

      // Block dangerous event handler properties.
      if (lowerName.startsWith('on')) {
        console.warn(
          `${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_EVENT_HANDLER(name)}`
        );
        continue;
      }

      // Block dangerous DOM properties that can inject raw HTML (e.g., innerHTML)
      if (DANGEROUS_PROPS.has(name)) {
        console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_PROP(name)}`);
        continue;
      }

      const isUrlProp = URL_PROPS.has(lowerName);

      registerReactiveEffect(
        ctx.el,
        propMap[name]!,
        (val) => {
          // Block dangerous protocols in property values (src, href, etc.).
          if (isUrlProp && typeof val === 'string' && isDangerousUrl(name, val)) {
            console.warn(
              `${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_PROTOCOL(name)}`
            );
            return;
          }

          // Redundancy check specifically for DOM properties
          if (el[name] !== val) {
            el[name] = val;
          }
        },
        `prop.${name}`
      );
    }
  }
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
      el.style.display = invert !== !!val ? showDisplay : 'none';
    },
    label
  );
}

/**
 * Two-way value binding with full feature parity to $.fn.atomVal.
 * Supports parse/format options, debouncing, IME composition, and focus-aware updates.
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
  const { fx, cleanup } = applyInputBinding(ctx.$el, atom, options);

  registry.trackEffect(ctx.el, fx);
  ctx.trackCleanup(cleanup);
}

/**
 * Two-way binding for checkbox/radio checked state.
 */
export function bindChecked(ctx: BindingContext, atom: WritableAtom<boolean>): void {
  const el = ctx.el as HTMLInputElement;
  const $el = ctx.$el;
  const isRadio = el.type === 'radio';

  // DOM → Atom (jQuery events for .trigger() compatibility)
  const handler = () => {
    const current = el.checked;
    if (atom.value !== current) {
      atom.value = current;
      // FIX 2: Radio buttons do not fire 'change' when unchecked by selecting another radio.
      // Trigger a custom event on sibling radios so they can sync their newly unchecked state.
      // FIX 2 follow-up: Scope to the containing <form> to avoid cross-form interference.
      // Falls back to document for radios outside any form.
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
  // Internal handler — skip batch() wrapping in the jQuery patch.
  (handler as unknown as Record<symbol, true>)[INTERNAL_HANDLER] = true;

  // DOM → Atom cleanup goes through ctx.trackCleanup (element lifecycle).
  // Atom → DOM cleanup goes through registry.trackEffect (reactive effect lifecycle).
  // The split is intentional: effects are disposed by the registry's effect tracker;
  // plain event listeners have no registry counterpart and need manual teardown.
  $el.on('change change.atomRadioSync', handler);
  ctx.trackCleanup(() => $el.off('change change.atomRadioSync', handler));

  // Atom → DOM
  const fx = effect(() => {
    const val = !!atom.value;
    untracked(() => {
      if (el.checked !== val) {
        el.checked = val;
        if (debug.enabled) debug.domUpdated(LOG_PREFIXES.BINDING, $el, 'checked', val);
      }
    });
  });
  registry.trackEffect(el, fx);
}

// ============================================================================
// Event Binding Handler
// ============================================================================

export function bindEvents(ctx: BindingContext, eventMap: NonNullable<BindingOptions['on']>): void {
  const $el = ctx.$el;
  $el.on(eventMap);
  ctx.trackCleanup(() => $el.off(eventMap));
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

/**
 * Disposes all reactive bindings on an element and its descendants.
 * Centralised here so `chainable.ts` does not need to import `registry` directly.
 */
export function bindUnbind(el: HTMLElement): void {
  registry.cleanupTree(el);
}
