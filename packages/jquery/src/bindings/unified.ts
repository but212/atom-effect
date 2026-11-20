/**
 * @module AEJUnifiedBindings
 *
 * Responsibility:
 * Provides a suite of unified reactive bindings for synchronizing state
 * with DOM properties, attributes, styles, and content.
 */

import { effect, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { createInputBinding } from '@/bindings/input-binding';
import { SYSTEM_BINDING, SYSTEM_SECURITY } from '@/constants';
import { registerMapEffect, registerReactiveEffect } from '@/core/effect-factory';
import { registry } from '@/core/registry';
import { markInternal } from '@/core/symbols';
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
function toKebab(inputString: string): string {
  return inputString.replace(/[A-Z]/g, (matchedLetter) => `-${matchedLetter.toLowerCase()}`);
}

/**
 * Filters a map of binding entries, validating each key for safety.
 * Logs warnings for unsafe properties or attributes.
 * @internal
 */
function getSafeEntries<T>(map: Record<string, T>, isProperty: boolean): [string, T][] {
  return Object.entries(map).filter(([name]) => {
    const lowerCaseName = name.toLowerCase();
    let safetyError: string | undefined;
    if (lowerCaseName.startsWith('on')) {
      safetyError = SYSTEM_SECURITY.ERRORS.BLOCKED_EVENT_HANDLER(name);
    } else if (
      lowerCaseName === 'srcdoc' ||
      (isProperty && (SYSTEM_SECURITY.DANGEROUS_PROPS as readonly string[]).includes(name))
    ) {
      safetyError = SYSTEM_SECURITY.ERRORS.BLOCKED_PROP(name);
    }

    if (safetyError !== undefined) {
      debug.warn(SYSTEM_BINDING.PREFIX, safetyError);
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
    (rawValue) => {
      const textContent = formatter ? formatter(rawValue) : String(rawValue ?? '');
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
    (rawHtml) => {
      const sanitized = sanitizeHtml(rawHtml);
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
        for (let i = 0, tokensLength = tokens.length; i < tokensLength; i++) {
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
  const descriptors: { property: string; kebab: string; unit: string }[] = [];
  const previousStyles = new Map<string, string>();

  for (const [property, value] of Object.entries(cssMap)) {
    const [source, unit] = Array.isArray(value) ? value : [value, ''];
    reactiveMap[property] = source;
    descriptors.push({ property, kebab: toKebab(property), unit });
  }

  registerMapEffect(
    element,
    reactiveMap,
    (states) => {
      for (const desc of descriptors) {
        const value = states[desc.property];
        const cssValueString = desc.unit ? `${value}${desc.unit}` : String(value);

        if (previousStyles.get(desc.property) !== cssValueString) {
          if (!isDangerousCssValue(cssValueString)) {
            style.setProperty(desc.kebab, cssValueString);
          }
          previousStyles.set(desc.property, cssValueString);
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
  const previousAttributes: Record<string, string | null> = {};
  const descriptors = safeEntries.map(([name]) => {
    previousAttributes[name] = element.getAttribute(name);
    return { name, isAria: name.toLowerCase().startsWith('aria-') };
  });

  registerMapEffect(
    element,
    safeMap,
    (states) => {
      for (const { name, isAria } of descriptors) {
        const value = states[name];
        let attributeValue: string | null = null;
        if (value !== null && value !== undefined) {
          if (typeof value === 'boolean') {
            attributeValue = value ? (isAria ? 'true' : name) : isAria ? 'false' : null;
          } else {
            attributeValue = String(value);
          }
        }

        // 2. Validate and Apply
        if (attributeValue !== null && isDangerousUrl(name, attributeValue)) {
          debug.warn(SYSTEM_BINDING.PREFIX, SYSTEM_SECURITY.ERRORS.BLOCKED_PROTOCOL(name));
          continue;
        }

        if (previousAttributes[name] !== attributeValue) {
          if (attributeValue === null) {
            element.removeAttribute(name);
          } else {
            element.setAttribute(name, attributeValue);
          }
          previousAttributes[name] = attributeValue;
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
  const safeEntries = getSafeEntries(propMap, true);
  const safeMap = Object.fromEntries(safeEntries);
  const previousValues: Record<string, unknown> = {};
  const propNames = safeEntries.map(([name]) => name);

  registerMapEffect(
    element,
    safeMap,
    (states) => {
      for (const name of propNames) {
        const value = states[name];
        if (previousValues[name] === value) continue;

        if (typeof value === 'string' && isDangerousUrl(name, value)) {
          debug.warn(SYSTEM_BINDING.PREFIX, SYSTEM_SECURITY.ERRORS.BLOCKED_PROTOCOL(name));
          continue;
        }

        Reflect.set(element, name, value);
        previousValues[name] = value;
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
    (conditionValue) => {
      const isVisible = invert !== !!conditionValue;
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
export function bindVal<T>(
  element: HTMLElement,
  atom: WritableAtom<T>,
  options: ValOptions<T> = {}
): void {
  const binding = createInputBinding(element, atom, options);
  if (!binding) return;
  const unregister = registry.onCleanup(element, binding.dispose);
  try {
    binding.start();
  } catch (error) {
    try {
      unregister();
    } finally {
      binding.dispose();
    }
    throw error;
  }
}

/**
 * Synchronizes the visual state of a radio button group.
 *
 * @param radioElement The radio input element that was recently selected.
 * @internal
 */
function syncRadios(radioElement: HTMLInputElement): void {
  if (radioElement.type === 'radio' && radioElement.name) {
    const root = radioElement.form || radioElement.getRootNode();
    const safeName = radioElement.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    if (root instanceof Document || root instanceof DocumentFragment || root instanceof Element) {
      const group = root.querySelectorAll(`input[type="radio"][name="${safeName}"]`);
      for (let i = 0; i < group.length; i++) {
        const element = group[i];
        if (element && element !== radioElement) {
          $(element).trigger('change.atomRadioSync');
        }
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
    debug.warn(SYSTEM_BINDING.PREFIX, 'atomChecked called on non-input element');
    return;
  }

  const $element = $(element);

  const onChange = () => {
    if (atom.peek() !== element.checked) {
      atom.value = element.checked;
      syncRadios(element);
    }
  };
  markInternal(onChange);

  $element.on('change.atomRadioSync', onChange);
  registry.onCleanup(element, () => {
    $element.off('change.atomRadioSync', onChange);
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
 * Binds a single event listener or an event map to an element.
 *
 * @internal
 */
export function bindOn(
  element: HTMLElement,
  event: string,
  handler: ((event: JQuery.TriggeredEvent) => void) | false
): void;
export function bindOn(element: HTMLElement, eventMap: NonNullable<BindingOptions['on']>): void;
export function bindOn(
  element: HTMLElement,
  eventOrMap: string | NonNullable<BindingOptions['on']>,
  handler?: ((event: JQuery.TriggeredEvent) => void) | false
): void {
  const $element = $(element);
  if (typeof eventOrMap === 'string') {
    if (!handler && handler !== false) return;
    // Own the false handler's identity and keep it stable if jQuery patches change.
    const listener = handler === false ? () => false : handler;
    if (handler === false) markInternal(listener);
    $element.on(eventOrMap, listener);
    registry.onCleanup(element, () => $element.off(eventOrMap, listener));
  } else {
    $element.on(eventOrMap);
    registry.onCleanup(element, () => $element.off(eventOrMap));
  }
}
