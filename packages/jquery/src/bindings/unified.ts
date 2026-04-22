import { effect, untracked } from '@but212/atom-effect';
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
import { debug } from '@/utils/debug';

import { isDangerousCssValue, isDangerousUrl, sanitizeHtml } from '@/utils/sanitize';

/**
 * @internal
 */
function toCamel(property: string): string {
  return property.includes('-')
    ? property.replace(/-./g, (match) => match[1]!.toUpperCase())
    : property;
}

/**
 * Blocks 'on*' event attributes and dangerous properties like `innerHTML`
 * from being bound as standard attributes/props to prevent XSS.
 *
 * @internal
 */
function isSafeBinding(name: string, isProperty: boolean): boolean {
  const lowerName = name.toLowerCase();
  if (lowerName.startsWith('on')) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_EVENT_HANDLER(name)}`);
    return false;
  }
  if (isProperty && (DANGEROUS_PROPS as readonly string[]).includes(name)) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_PROP(name)}`);
    return false;
  }
  return true;
}

/**
 * When to use:
 * - Rendering raw text that stays in sync with an atom.
 *
 * @param element - The target element.
 * @param value - The reactive source.
 * @param formatter - Optional function to format the value.
 *
 * @internal
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
      if (element.textContent !== textContent) element.textContent = textContent;
    },
    'text'
  );
}

/**
 * Logic: Descendant bindings are automatically cleaned up via the registry
 * before re-writing `innerHTML` to prevent memory leaks from detached nodes.
 *
 * Caution: Even with sanitization, rendering unsanitized user content
 * is a security risk. Use `bindText` whenever possible.
 *
 * When to use:
 * - Rendering rich text or trusted HTML templates.
 *
 * @param element - The target element.
 * @param value - The reactive source.
 *
 * @internal
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
 * Logic: Token Management
 * - Supports space-separated class names in keys.
 * - Tracks active tokens in a `Set` to ensure classes are only removed if no
 *   other active definition in the map requires them.
 *
 * @param element - The target element.
 * @param classMap - A map of class names to boolean sources.
 *
 * @internal
 */
export function bindClass(
  element: HTMLElement,
  classMap: Record<string, AsyncReactiveValue<boolean>>
): void {
  const tokens: Record<string, string[]> = {};
  let prevActive = new Set<string>();

  for (const key of Object.keys(classMap)) {
    const trimmedKey = key.trim();
    tokens[key] = trimmedKey.includes(' ') ? trimmedKey.split(/\s+/).filter(Boolean) : [trimmedKey];
  }

  registerMapEffect(
    element,
    classMap,
    (states) => {
      const currentActiveTokens = new Set<string>();
      for (const [key, isActive] of Object.entries(states)) {
        if (isActive) {
          for (const token of tokens[key]!) {
            currentActiveTokens.add(token);
          }
        }
      }

      // Add new tokens
      for (const token of currentActiveTokens) {
        if (!prevActive.has(token)) {
          element.classList.add(token);
        }
      }

      // Remove tokens that are no longer active
      for (const token of prevActive) {
        if (!currentActiveTokens.has(token)) {
          element.classList.remove(token);
        }
      }

      prevActive = currentActiveTokens;
    },
    'class'
  );
}

/**
 * Security: Blocks dangerous CSS values (like `url()` with javascript protocols)
 * to prevent XSS and style-based attacks.
 *
 * @param element - The target element.
 * @param cssMap - A map of style properties to values.
 *
 * @internal
 */
export function bindCss(element: HTMLElement, cssMap: Record<string, CssValue>): void {
  const style = element.style as unknown as Record<string, string | null>;
  const reactiveMap: Record<string, ReactiveValue<unknown>> = {};
  const metaMap: Record<string, { camelCase: string; unit: string }> = {};
  const prev: Record<string, string | null> = {};

  for (const [property, value] of Object.entries(cssMap)) {
    const [source, unit] = Array.isArray(value) ? value : [value, ''];
    reactiveMap[property] = source;
    metaMap[property] = { camelCase: toCamel(property), unit };
  }

  registerMapEffect(
    element,
    reactiveMap,
    (states) => {
      for (const [property, value] of Object.entries(states)) {
        const meta = metaMap[property]!;
        const str = meta.unit ? `${value}${meta.unit}` : String(value);

        if (prev[property] !== str) {
          if (!isDangerousCssValue(str)) {
            style[meta.camelCase] = str;
          }
          prev[property] = str;
        }
      }
    },
    'css'
  );
}

/**
 * Logic:
 * - Handles specific logic for boolean attributes (like `disabled`).
 * - Validates URL protocols (href/src) before applying changes.
 * - Supports ARIA attributes with distinct boolean-to-string mapping.
 *
 * @param element - The target element.
 * @param attrMap - A map of attribute names to values.
 *
 * @internal
 */
export function bindAttr(
  element: HTMLElement,
  attrMap: Record<string, AsyncReactiveValue<PrimitiveValue>>
): void {
  const safeEntries = Object.entries(attrMap).filter(([name]) => isSafeBinding(name, false));
  const safeMap = Object.fromEntries(safeEntries);
  const metaMap: Record<string, { isAria: boolean }> = {};
  const prev: Record<string, string | null> = {};

  for (const [name] of safeEntries) {
    metaMap[name] = { isAria: name.toLowerCase().startsWith('aria-') };
    prev[name] = element.getAttribute(name);
  }

  registerMapEffect(
    element,
    safeMap,
    (states) => {
      for (const [name, value] of Object.entries(states)) {
        const meta = metaMap[name]!;
        const val = value as PrimitiveValue;

        if (val == null || (val === false && !meta.isAria)) {
          if (prev[name] !== null) element.removeAttribute(name);
          prev[name] = null;
          continue;
        }

        const next = val === true ? (meta.isAria ? 'true' : name) : String(val);
        if (isDangerousUrl(name, next)) {
          console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_PROTOCOL(name)}`);
          continue;
        }

        if (prev[name] !== next) {
          element.setAttribute(name, next);
          prev[name] = next;
        }
      }
    },
    'attr'
  );
}

/**
 * Security: Blocks dangerous properties (e.g., `innerHTML`, `on*` events)
 * and validates URL-based properties to prevent injection attacks.
 *
 * @param element - The target element.
 * @param propMap - A map of property names to values.
 *
 * @internal
 */
export function bindProp(
  element: HTMLElement,
  propMap: Record<string, AsyncReactiveValue<unknown>>
): void {
  const target = element as unknown as Record<string, unknown>;
  const safeEntries = Object.entries(propMap).filter(([name]) => isSafeBinding(name, true));
  const safeMap = Object.fromEntries(safeEntries);
  const previousValues: Record<string, unknown> = {};

  registerMapEffect(
    element,
    safeMap,
    (states) => {
      for (const [name, value] of Object.entries(states)) {
        if (previousValues[name] === value) continue;

        if (typeof value === 'string' && isDangerousUrl(name, value)) {
          console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_PROTOCOL(name)}`);
          continue;
        }

        target[name] = value;
        previousValues[name] = value;
      }
    },
    'prop'
  );
}

/**
 * Logic: Preserves the original `display` mode (e.g., `flex`, `block`)
 * so that visibility restoration returns the element to its intended layout state.
 *
 * @param element - The target element.
 * @param condition - The visibility condition.
 * @param invert - Whether to invert the condition.
 *
 * @internal
 */
export function bindVisibility(
  element: HTMLElement,
  condition: AsyncReactiveValue<boolean>,
  invert: boolean
): void {
  let prevDisplay = element.style.display === 'none' ? '' : element.style.display;

  registerReactiveEffect(
    element,
    condition,
    (value) => {
      const isVisible = invert !== !!value;
      if (isVisible) {
        if (element.style.display === 'none') {
          element.style.display = prevDisplay;
        }
      } else if (element.style.display !== 'none') {
        prevDisplay = element.style.display;
        element.style.display = 'none';
      }
    },
    invert ? 'hide' : 'show'
  );
}

/**
 * @internal
 */
export function bindVal(
  element: HTMLElement,
  atom: WritableAtom<unknown>,
  options: ValOptions<unknown> = {}
): void {
  const tagName = element.tagName.toLowerCase();
  if (!(VALID_INPUT_TAGS as readonly string[]).includes(tagName)) {
    console.warn(
      `${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.INVALID_INPUT_ELEMENT(tagName)}`
    );
    return;
  }
  const { reactiveEffect, cleanup } = applyInputBinding($(element), atom, options);
  registry.trackEffect(element, reactiveEffect);
  registry.onCleanup(element, cleanup);
}

/**
 * Requirement: Radio buttons in the same name group don't fire 'change'
 * when they are automatically unchecked by another radio selection.
 *
 * Logic: Manually triggers a `change.atomRadioSync` event for the entire group
 * to ensure reactive consistency across the radio group.
 *
 * @internal
 */
function syncRadios(element: HTMLInputElement): void {
  if (element.type === 'radio' && element.name) {
    (element.form ? $(element.form) : $(document))
      .find(`input[type="radio"][name="${$.escapeSelector(element.name)}"]`)
      .not(element)
      .trigger('change.atomRadioSync');
  }
}

/**
 * @internal
 */
export function bindChecked(element: HTMLElement, atom: WritableAtom<boolean>): void {
  if (!(element instanceof HTMLInputElement)) {
    console.warn(`${LOG_PREFIXES.BINDING} atomChecked called on non-input element`);
    return;
  }
  const inputElement = element;
  const $element = $(inputElement);

  const onChange = () => {
    if (atom.peek() !== inputElement.checked) {
      atom.value = inputElement.checked;
      syncRadios(inputElement);
    }
  };
  (onChange as unknown as Record<symbol, boolean>)[INTERNAL_HANDLER] = true;

  $element.on('change change.atomRadioSync', onChange);
  registry.onCleanup(inputElement, () => $element.off('change change.atomRadioSync', onChange));

  registry.trackEffect(
    inputElement,
    effect(() => {
      const isChecked = !!atom.value;
      untracked(() => {
        if (inputElement.checked !== isChecked) {
          inputElement.checked = isChecked;
          debug.domUpdated(LOG_PREFIXES.BINDING, inputElement, 'checked', isChecked);
          if (isChecked) syncRadios(inputElement);
        }
      });
    })
  );
}

/**
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
