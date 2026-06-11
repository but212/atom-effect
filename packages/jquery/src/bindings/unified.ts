/**
 * @module AEJUnifiedBindings
 *
 * Responsibility:
 * Provides a suite of unified reactive bindings for synchronizing state
 * with DOM properties, attributes, styles, and content.
 */

import { effect, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { applyInputBinding } from '@/bindings/input-binding';
import { SYSTEM_BINDING, SYSTEM_SECURITY } from '@/constants';
import { registerMapEffect, registerReactiveEffect } from '@/core/effect-factory';
import { registry } from '@/core/registry';
import { INTERNAL_HANDLER } from '@/core/symbols';
import type {
  AsyncReactiveValue,
  BindingOptions,
  CssValue,
  PrimitiveValue,
  ReactiveValue,
  ValOptions,
  WritableAtom,
} from '@/types';
import { debug } from '@/utils/debug';
import { isDangerousCssValue, isDangerousUrl, sanitizeHtml } from '@/utils/sanitize';

/**
 * Converts a camelCase property name to kebab-case.
 * @internal
 */
function toKebab(str: string): string {
  return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/**
 * Logic: XSS Protection Filter
 * Validates whether a property or attribute name is safe for reactive binding.
 */
function checkBindingSafety(name: string, isProperty: boolean): string | undefined {
  const lower = name.toLowerCase();
  if (lower.startsWith('on')) return SYSTEM_SECURITY.ERRORS.BLOCKED_EVENT_HANDLER(name);
  if (isProperty && (SYSTEM_SECURITY.DANGEROUS_PROPS as readonly string[]).includes(name)) {
    return SYSTEM_SECURITY.ERRORS.BLOCKED_PROP(name);
  }
  return undefined;
}

/**
 * Filters a map of binding entries, validating each key for safety.
 * Logs warnings for unsafe properties or attributes.
 * @internal
 */
function getSafeEntries<T>(map: Record<string, T>, isProperty: boolean): [string, T][] {
  return Object.entries(map).filter(([name]) => {
    const err = checkBindingSafety(name, isProperty);
    if (err !== undefined) {
      console.warn(`${SYSTEM_BINDING.PREFIX} ${err}`);
      return false;
    }
    return true;
  });
}

/**
 * Logic: XSS-Safe Text Binding
 *
 * When to use:
 * - Use as the primary method for rendering dynamic content to ensure
 *   data is strictly treated as text, preventing script injection.
 */
export function bindText<T = unknown>(
  element: HTMLElement,
  value: AsyncReactiveValue<T>,
  formatter?: (value: T) => string
): void {
  registerReactiveEffect(
    element,
    value,
    (val) => {
      const textContent = formatter ? formatter(val) : String(val ?? '');
      if (element.textContent !== textContent) {
        element.textContent = textContent;
      }
    },
    'text'
  );
}

/**
 * Logic: Sanitized HTML Binding
 * Binds the HTML content of an element to a reactive source.
 *
 * Logic: Subtree Cleanup
 * Before overwriting `innerHTML`, all reactive bindings within descendants
 * are cleaned up to prevent memory leaks from detached nodes.
 *
 * Caution: Security Risk
 * Even with sanitization, rendering raw HTML is risky. Prefer `bindText`.
 */
export function bindHtml(element: HTMLElement, value: AsyncReactiveValue<string>): void {
  let prevHtml: string | null = null;

  registerReactiveEffect(
    element,
    value,
    (val) => {
      const sanitized = sanitizeHtml(val as string);
      if (prevHtml !== sanitized) {
        registry.cleanupDescendants(element);
        element.innerHTML = sanitized;
        prevHtml = sanitized;
      }
    },
    'html'
  );
}

/**
 * Logic: Reactive Class Token Management
 * Binds a set of CSS classes to reactive conditions.
 *
 * Logic: Token Aggregation
 * Active tokens are tracked in a `Set` to ensure classes are only removed
 * if no other active definition within the map requires them.
 */
export function bindClass(
  element: HTMLElement,
  classMap: Record<string, AsyncReactiveValue<boolean>>
): void {
  const tokensMap = new Map<string, string[]>();

  for (const key in classMap) {
    if (Object.hasOwn(classMap, key)) {
      tokensMap.set(key, key.trim().split(/\s+/).filter(Boolean));
    }
  }

  registerMapEffect(
    element,
    classMap,
    (states) => {
      // Logic: Aggregate all active tokens to handle overlapping definitions.
      const activeTokens = new Set<string>();
      for (const key in states) {
        if (Object.hasOwn(states, key) && states[key]) {
          const tokens = tokensMap.get(key);
          if (tokens) {
            for (let i = 0; i < tokens.length; i++) {
              const token = tokens[i];
              if (token !== undefined) activeTokens.add(token);
            }
          }
        }
      }

      // Logic: Atomic Synchronization
      // Synchronizes the element's class list with the current state map
      // in a single pass using the native classList API.
      for (const tokens of tokensMap.values()) {
        for (let i = 0, len = tokens.length; i < len; i++) {
          const token = tokens[i];
          if (token !== undefined) {
            element.classList.toggle(token, activeTokens.has(token));
          }
        }
      }
    },
    'class'
  );
}

/**
 * Logic: Reactive Style Binding
 * Binds inline CSS styles to reactive sources.
 *
 * Security: Style Injection Protection
 * Dangerous CSS values (e.g., `url()` with `javascript:`) are blocked.
 */
export function bindCss(element: HTMLElement, cssMap: Record<string, CssValue>): void {
  const { style } = element;
  const reactiveMap: Record<string, ReactiveValue<unknown>> = {};
  const metaMap: Record<string, string> = {};
  const prev = new Map<string, string>();

  for (const [property, value] of Object.entries(cssMap)) {
    const [source, unit] = Array.isArray(value) ? value : [value, ''];
    reactiveMap[property] = source;
    metaMap[property] = unit;
  }

  registerMapEffect(
    element,
    reactiveMap,
    (states) => {
      for (const property in states) {
        if (Object.hasOwn(states, property)) {
          const value = states[property];
          const unit = metaMap[property] ?? '';
          const str = unit ? `${value}${unit}` : String(value);

          if (prev.get(property) !== str) {
            if (!isDangerousCssValue(str)) {
              style.setProperty(toKebab(property), str);
            }
            prev.set(property, str);
          }
        }
      }
    },
    'css'
  );
}

/**
 * Logic: Attribute Transformation Pipeline
 * Binds HTML attributes to reactive sources with unified transformations.
 *
 * Logic: Category Flow
 * - Boolean: Automatically removed when `false`.
 * - ARIA: Boolean values mapped to 'true'/'false' strings.
 * - Standard: Values coerced to strings.
 *
 * Security: Protocol Validation
 * Validates 'href' and 'src' against dangerous protocols.
 */
export function bindAttr(
  element: HTMLElement,
  attrMap: Record<string, AsyncReactiveValue<PrimitiveValue>>
): void {
  const safeEntries = getSafeEntries(attrMap, false);
  const safeMap = Object.fromEntries(safeEntries);
  const isAriaMap: Record<string, boolean> = {};
  const prev: Record<string, string | null> = {};

  for (const [name] of safeEntries) {
    isAriaMap[name] = name.toLowerCase().startsWith('aria-');
    prev[name] = element.getAttribute(name);
  }

  registerMapEffect(
    element,
    safeMap,
    (states) => {
      for (const name in states) {
        if (Object.hasOwn(states, name)) {
          if (!(name in isAriaMap)) continue;
          const isAria = isAriaMap[name];
          if (isAria === undefined) continue;

          const value = states[name];
          let attrVal: string | null = null;
          if (value !== null && value !== undefined) {
            if (typeof value === 'boolean') {
              attrVal = value ? (isAria ? 'true' : name) : isAria ? 'false' : null;
            } else {
              attrVal = String(value);
            }
          }

          // 2. Validate and Apply
          if (attrVal !== null && isDangerousUrl(name, attrVal as string)) {
            console.warn(
              `${SYSTEM_BINDING.PREFIX} ${SYSTEM_SECURITY.ERRORS.BLOCKED_PROTOCOL(name)}`
            );
            continue;
          }

          if (prev[name] !== attrVal) {
            if (attrVal === null) {
              element.removeAttribute(name);
            } else {
              element.setAttribute(name, attrVal as string);
            }
            prev[name] = attrVal as string | null;
          }
        }
      }
    },
    'attr'
  );
}

/**
 * Logic: Direct Property Binding
 * Binds DOM properties directly to reactive sources.
 *
 * Security: Prototype Pollution Guard
 * Blocks sensitive properties (e.g., `innerHTML`, event handlers)
 * and validates URL-based properties.
 */
export function bindProp(
  element: HTMLElement,
  propMap: Record<string, AsyncReactiveValue<unknown>>
): void {
  const target = element as unknown as Record<string, unknown>;
  const safeEntries = getSafeEntries(propMap, true);
  const safeMap = Object.fromEntries(safeEntries);
  const previousValues: Record<string, unknown> = {};

  registerMapEffect(
    element,
    safeMap,
    (states) => {
      for (const name in states) {
        if (Object.hasOwn(states, name)) {
          const value = states[name];
          if (previousValues[name] === value) continue;

          if (typeof value === 'string' && isDangerousUrl(name, value)) {
            console.warn(
              `${SYSTEM_BINDING.PREFIX} ${SYSTEM_SECURITY.ERRORS.BLOCKED_PROTOCOL(name)}`
            );
            continue;
          }

          target[name] = value;
          previousValues[name] = value;
        }
      }
    },
    'prop'
  );
}

/**
 * Logic: Layout-Preserving Visibility
 * Manages element visibility based on a reactive condition.
 *
 * Logic: Strategy
 * Transitions between 'visible' and 'hidden' while preserving the original
 * 'display' mode (e.g., flex, grid) when restored.
 */
export function bindVisibility(
  element: HTMLElement,
  condition: AsyncReactiveValue<boolean>,
  invert: boolean
): void {
  const $element = $(element);
  registerReactiveEffect(
    element,
    condition,
    (value) => {
      const isVisible = invert !== !!value;
      $element.toggle(isVisible);
    },
    invert ? 'hide' : 'show'
  );
}

/**
 * Logic: Two-Way Value Synchronization
 * Binds a form control's value to a writable atom.
 *
 * When to use:
 * - Implement two-way sync for inputs, selects, and textareas.
 */
export function bindVal(
  element: HTMLElement,
  atom: WritableAtom<unknown>,
  options: ValOptions<unknown> = {}
): void {
  const tagName = element.tagName.toLowerCase();
  const isValidTag =
    (SYSTEM_BINDING.VALID_INPUT_TAGS as readonly string[]).includes(tagName) ||
    tagName.includes('-'); // Support Custom Elements (FACE)

  if (!isValidTag) {
    console.warn(
      `${SYSTEM_BINDING.PREFIX} ${SYSTEM_BINDING.ERRORS.INVALID_INPUT_ELEMENT(tagName)}`
    );
    return;
  }
  const { reactiveEffect, cleanup } = applyInputBinding($(element), atom, options);
  registry.trackEffect(element, reactiveEffect);
  registry.onCleanup(element, cleanup);
}

/**
 * Synchronizes the visual state of a radio button group.
 *
 * @param element - The radio input element that was recently selected.
 * @internal
 */
function syncRadios(element: HTMLInputElement): void {
  if (element.type === 'radio' && element.name) {
    const root = element.form || element.getRootNode();
    const safeName = element.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const group = (root as ParentNode).querySelectorAll(`input[type="radio"][name="${safeName}"]`);
    for (let i = 0; i < group.length; i++) {
      const el = group[i];
      if (el && el !== element) {
        $(el as HTMLElement).trigger('change.atomRadioSync');
      }
    }
  }
}

/**
 * Logic: Two-Way Checked State Synchronization
 * Binds a checkbox or radio button's checked state to a writable atom.
 */
export function bindChecked(element: HTMLElement, atom: WritableAtom<boolean>): void {
  if (!(element instanceof HTMLInputElement)) {
    console.warn(`${SYSTEM_BINDING.PREFIX} atomChecked called on non-input element`);
    return;
  }

  const $element = $(element);

  const onChange = () => {
    if (atom.peek() !== element.checked) {
      atom.value = element.checked;
      syncRadios(element);
    }
  };
  (onChange as unknown as Record<symbol, boolean>)[INTERNAL_HANDLER] = true;

  $element.on('change change.atomRadioSync', onChange);
  registry.onCleanup(element, () => {
    $element.off('change change.atomRadioSync', onChange);
  });

  registry.trackEffect(
    element,
    effect(() => {
      const isChecked = !!atom.value;
      untracked(() => {
        if (element.checked !== isChecked) {
          element.checked = isChecked;
          debug.domUpdated(SYSTEM_BINDING.PREFIX, element, 'checked', isChecked);
          if (isChecked) syncRadios(element);
        }
      });
    })
  );
}

/**
 * Binds a mapping of event listeners to an element.
 *
 * @param element - The target HTMLElement.
 * @param eventMap - A record mapping event names to handler functions.
 * @internal
 */
export function bindEvents(
  element: HTMLElement,
  eventMap: NonNullable<BindingOptions['on']>
): void {
  const $element = $(element);
  $element.on(eventMap);
  registry.onCleanup(element, () => $element.off(eventMap));
}

/**
 * Binds a single event listener to an element.
 *
 * @param element - The target HTMLElement.
 * @param event - The name of the event.
 * @param handler - The handler function to execute.
 * @internal
 */
export function bindOn(
  element: HTMLElement,
  event: string,
  handler: (event: JQuery.TriggeredEvent) => void
): void {
  const $element = $(element);
  $element.on(event, handler);
  registry.onCleanup(element, () => $element.off(event, handler));
}
