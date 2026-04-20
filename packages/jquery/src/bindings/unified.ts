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

/** Converts kebab-case CSS properties to camelCase. */
function getCamelCase(property: string): string {
  return property.includes('-')
    ? property.replace(/-./g, (match) => match[1]!.toUpperCase())
    : property;
}

/**
 * Security: Blocks 'on*' event attributes and dangerous properties like innerHTML
 * from being bound as standard attributes/props to prevent XSS.
 */
function isSafeBinding(name: string, isProperty: boolean): boolean {
  const lowerName = name.toLowerCase();
  if (lowerName.startsWith('on')) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_EVENT_HANDLER(name)}`);
    return false;
  }
  if (isProperty && DANGEROUS_PROPS.includes(name)) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_PROP(name)}`);
    return false;
  }
  return true;
}

/** Syncs element text content with a reactive source. */
export function bindText<T = unknown>(
  element: HTMLElement,
  value: AsyncReactiveValue<T>,
  formatter?: (value: T) => string
): void {
  registerReactiveEffect(
    element,
    value,
    (currentValue) => {
      const textContent = formatter ? formatter(currentValue) : String(currentValue ?? '');
      if (element.textContent !== textContent) element.textContent = textContent;
    },
    'text'
  );
}

/**
 * Binds sanitized HTML content to an element.
 * Note: Descendant bindings are automatically cleaned up before re-writing innerHTML.
 */
export function bindHtml(element: HTMLElement, value: AsyncReactiveValue<string>): void {
  let lastHtml: string | null = null;

  registerReactiveEffect(
    element,
    value,
    (currentValue) => {
      const sanitizedHtml = sanitizeHtml(currentValue as string);
      if (lastHtml !== sanitizedHtml) {
        registry.cleanupDescendants(element);
        element.innerHTML = sanitizedHtml;
        lastHtml = sanitizedHtml;
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
  element: HTMLElement,
  classMap: Record<string, AsyncReactiveValue<boolean>>
): void {
  const tokenMap: Record<string, string[]> = {};
  let lastActiveTokens = new Set<string>();

  for (const key of Object.keys(classMap)) {
    const trimmedKey = key.trim();
    tokenMap[key] = trimmedKey.includes(' ')
      ? trimmedKey.split(/\s+/).filter(Boolean)
      : [trimmedKey];
  }

  registerMapEffect(
    element,
    classMap,
    (states) => {
      const currentActiveTokens = new Set<string>();
      for (const [key, isActive] of Object.entries(states)) {
        if (isActive) {
          for (const token of tokenMap[key]!) {
            currentActiveTokens.add(token);
          }
        }
      }

      // Add new tokens
      for (const token of currentActiveTokens) {
        if (!lastActiveTokens.has(token)) {
          element.classList.add(token);
        }
      }

      // Remove tokens that are no longer active
      for (const token of lastActiveTokens) {
        if (!currentActiveTokens.has(token)) {
          element.classList.remove(token);
        }
      }

      lastActiveTokens = currentActiveTokens;
    },
    'class'
  );
}

/** Reactively updates inline styles while blocking potentially harmful CSS values. */
export function bindCss(element: HTMLElement, cssMap: Record<string, CssValue>): void {
  const style = element.style as unknown as Record<string, string | null>;
  const reactiveMap: Record<string, ReactiveValue<unknown>> = {};
  const metadataMap: Record<string, { camelCase: string; unit: string }> = {};
  const previousValues: Record<string, string | null> = {};

  for (const [property, value] of Object.entries(cssMap)) {
    const [source, unit] = Array.isArray(value) ? value : [value, ''];
    reactiveMap[property] = source;
    metadataMap[property] = { camelCase: getCamelCase(property), unit };
  }

  registerMapEffect(
    element,
    reactiveMap,
    (states) => {
      for (const [property, value] of Object.entries(states)) {
        const metadata = metadataMap[property]!;
        const valueString = metadata.unit ? `${value}${metadata.unit}` : String(value);

        if (previousValues[property] !== valueString) {
          if (!isDangerousCssValue(valueString)) {
            style[metadata.camelCase] = valueString;
          }
          previousValues[property] = valueString;
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
  element: HTMLElement,
  attrMap: Record<string, AsyncReactiveValue<PrimitiveValue>>
): void {
  const safeEntries = Object.entries(attrMap).filter(([name]) => isSafeBinding(name, false));
  const safeMap = Object.fromEntries(safeEntries);
  const metadataMap: Record<string, { isAria: boolean }> = {};
  const cache: Record<string, string | null> = {};

  for (const [name] of safeEntries) {
    metadataMap[name] = { isAria: name.toLowerCase().startsWith('aria-') };
    cache[name] = element.getAttribute(name);
  }

  registerMapEffect(
    element,
    safeMap,
    (states) => {
      for (const [name, value] of Object.entries(states)) {
        const metadata = metadataMap[name]!;
        const primitiveValue = value as PrimitiveValue;

        if (primitiveValue == null || (primitiveValue === false && !metadata.isAria)) {
          if (cache[name] !== null) element.removeAttribute(name);
          cache[name] = null;
          continue;
        }

        const newValue =
          primitiveValue === true ? (metadata.isAria ? 'true' : name) : String(primitiveValue);
        if (isDangerousUrl(name, newValue)) {
          console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.SECURITY.BLOCKED_PROTOCOL(name)}`);
          continue;
        }

        if (cache[name] !== newValue) {
          element.setAttribute(name, newValue);
          cache[name] = newValue;
        }
      }
    },
    'attr'
  );
}

/** Directly maps reactive values to DOM element properties with URL validation. */
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

/** Toggles display style between 'none' and its original state. */
export function bindVisibility(
  element: HTMLElement,
  condition: AsyncReactiveValue<boolean>,
  invert: boolean
): void {
  let lastDisplay = element.style.display === 'none' ? '' : element.style.display;

  registerReactiveEffect(
    element,
    condition,
    (value) => {
      const isVisible = invert !== !!value;
      if (isVisible) {
        if (element.style.display === 'none') {
          element.style.display = lastDisplay;
        }
      } else if (element.style.display !== 'none') {
        lastDisplay = element.style.display;
        element.style.display = 'none';
      }
    },
    invert ? 'hide' : 'show'
  );
}

/** Entry point for input/value bindings; delegates to the InputBinding engine. */
export function bindVal(
  element: HTMLElement,
  atom: WritableAtom<unknown>,
  options: ValOptions<unknown> = {}
): void {
  const tagName = element.tagName.toLowerCase();
  if (!VALID_INPUT_TAGS.includes(tagName)) {
    console.warn(
      `${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.INVALID_INPUT_ELEMENT(tagName)}`
    );
    return;
  }
  const { reactiveEffect, cleanup } = applyInputBinding($(element), atom, options);
  registry.trackEffect(element, reactiveEffect);
  registry.trackCleanup(element, cleanup);
}

/**
 * Requirement: Radio buttons in the same name group don't fire 'change'
 * when they are automatically unchecked by another radio selection.
 * We manually trigger a sync for the rest of the group.
 */
function synchronizeRadioGroup(element: HTMLInputElement): void {
  if (element.type === 'radio' && element.name) {
    (element.form ? $(element.form) : $(document))
      .find(`input[type="radio"][name="${$.escapeSelector(element.name)}"]`)
      .not(element)
      .trigger('change.atomRadioSync');
  }
}

/** Specialized two-way binding for checkbox and radio 'checked' states. */
export function bindChecked(element: HTMLElement, atom: WritableAtom<boolean>): void {
  if (!(element instanceof HTMLInputElement)) {
    console.warn(`${LOG_PREFIXES.BINDING} atomChecked called on non-input element`);
    return;
  }
  const inputElement = element;
  const $element = $(inputElement);

  const changeHandler = () => {
    if (atom.peek() !== inputElement.checked) {
      atom.value = inputElement.checked;
      synchronizeRadioGroup(inputElement);
    }
  };
  (changeHandler as unknown as Record<symbol, boolean>)[INTERNAL_HANDLER] = true;

  $element.on('change change.atomRadioSync', changeHandler);
  registry.trackCleanup(inputElement, () =>
    $element.off('change change.atomRadioSync', changeHandler)
  );

  registry.trackEffect(
    inputElement,
    effect(() => {
      const isChecked = !!atom.value;
      untracked(() => {
        if (inputElement.checked !== isChecked) {
          inputElement.checked = isChecked;
          debug.domUpdated(LOG_PREFIXES.BINDING, inputElement, 'checked', isChecked);
          if (isChecked) synchronizeRadioGroup(inputElement);
        }
      });
    })
  );
}

/** Registers flat event maps with automatic lifecycle cleanup. */
export function bindEvents(
  element: HTMLElement,
  eventMap: NonNullable<BindingOptions['on']>
): void {
  const $element = $(element);
  $element.on(eventMap);
  registry.trackCleanup(element, () => $element.off(eventMap));
}

/** Registers a single event listener with automatic lifecycle cleanup. */
export function bindOn(
  element: HTMLElement,
  event: string,
  handler: (event: JQuery.TriggeredEvent) => void
): void {
  const $element = $(element);
  $element.on(event, handler);
  registry.trackCleanup(element, () => $element.off(event, handler));
}
