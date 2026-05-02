import { effect, untracked } from '@but212/atom-effect';
import { Option } from '@but212/atom-effect-utils';
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
 * Validates whether a property or attribute name is safe for reactive binding.
 *
 * Logic: This utility prevents XSS attacks by blocking 'on*' event attributes
 * and sensitive properties like `innerHTML` from being manipulated via
 * standard attribute or property bindings.
 *
 * @param name - The name of the property or attribute.
 * @param isProperty - True if checking a DOM property, false for attributes.
 * @returns True if the binding is considered safe.
 * @internal
 */
function isSafeBinding(name: string, isProperty: boolean): boolean {
  const lowerName = name.toLowerCase();
  if (lowerName.startsWith('on')) {
    console.warn(`${SYSTEM_BINDING.PREFIX} ${SYSTEM_SECURITY.ERRORS.BLOCKED_EVENT_HANDLER(name)}`);
    return false;
  }
  if (isProperty && (SYSTEM_SECURITY.DANGEROUS_PROPS as readonly string[]).includes(name)) {
    console.warn(`${SYSTEM_BINDING.PREFIX} ${SYSTEM_SECURITY.ERRORS.BLOCKED_PROP(name)}`);
    return false;
  }
  return true;
}

/**
 * Binds the text content of an element to a reactive source.
 *
 * When to use:
 * - To synchronize labels or counts with an atom without the risk of XSS.
 *
 * @param element - The target HTMLElement.
 * @param value - The reactive source atom or computed.
 * @param formatter - An optional function to format the value before display.
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
      const textContent = Option.unwrapOr(
        Option.map(Option.fromNullable(formatter), (fn: Function) => fn(val)),
        String(val ?? '')
      );
      if (element.textContent !== textContent) {
        element.textContent = textContent;
      }
    },
    'text'
  );
}

/**
 * Binds the HTML content of an element to a reactive source.
 *
 * Logic: To prevent memory leaks from detached nodes, all reactive bindings
 * within the element's descendants are automatically cleaned up via the
 * registry before the `innerHTML` is overwritten.
 *
 * Caution: Even with sanitization, rendering user-provided HTML remains a
 * security risk. Prefer `bindText` whenever possible.
 *
 * When to use:
 * - To render trusted templates or rich text containing formatting tags.
 *
 * @param element - The target HTMLElement.
 * @param value - The reactive source containing the HTML string.
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
 * Binds a set of CSS classes to reactive conditions.
 *
 * Logic: Token Management
 * - Supports space-separated class names within keys.
 * - Active tokens are tracked in a `Set` to ensure classes are only removed
 *   if no other active definition within the map requires them.
 *
 * @param element - The target HTMLElement.
 * @param classMap - A record mapping class names to reactive boolean conditions.
 * @internal
 */
export function bindClass(
  element: HTMLElement,
  classMap: Record<string, AsyncReactiveValue<boolean>>
): void {
  const tokensMap = new Map<string, string[]>();

  Object.keys(classMap).forEach((key) => {
    const trimmed = key.trim();
    tokensMap.set(key, trimmed.includes(' ') ? trimmed.split(/\s+/).filter(Boolean) : [trimmed]);
  });

  registerMapEffect(
    element,
    classMap,
    (states) => {
      // Logic: Aggregate all active tokens to handle overlapping definitions.
      const activeTokens = new Set<string>();
      for (const [key, isActive] of Object.entries(states)) {
        if (isActive) {
          tokensMap.get(key)?.forEach((t) => activeTokens.add(t));
        }
      }

      // Logic: Atomic toggle using native classList API.
      Array.from(tokensMap.values())
        .flat()
        .forEach((token) => {
          element.classList.toggle(token, activeTokens.has(token));
        });
    },
    'class'
  );
}

/**
 * Binds inline CSS styles to reactive sources.
 *
 * Security: Dangerous CSS values (e.g., `url()` containing javascript: protocols)
 * are blocked to prevent XSS and style-based injection attacks.
 *
 * @param element - The target HTMLElement.
 * @param cssMap - A record mapping style properties to reactive values.
 * @internal
 */
export function bindCss(element: HTMLElement, cssMap: Record<string, CssValue>): void {
  const { style } = element;
  const reactiveMap: Record<string, ReactiveValue<unknown>> = {};
  const metaMap: Record<string, string> = {};
  const prev = new Map<string, string>();

  Object.entries(cssMap).forEach(([property, value]) => {
    const [source, unit] = Array.isArray(value) ? value : [value, ''];
    reactiveMap[property] = source;
    metaMap[property] = unit;
  });

  registerMapEffect(
    element,
    reactiveMap,
    (states) => {
      Object.entries(states).forEach(([property, value]) => {
        const unit = metaMap[property] ?? '';
        const str = unit ? `${value}${unit}` : String(value);

        if (prev.get(property) !== str) {
          if (!isDangerousCssValue(str)) {
            style.setProperty(toKebab(property), str);
          }
          prev.set(property, str);
        }
      });
    },
    'css'
  );
}

/**
 * Binds HTML attributes to reactive sources.
 *
 * Logic: Attribute Transformation Pipeline
 * Implements a unified transformation flow for different attribute categories:
 * - Boolean Attributes: Automatically removed when the condition is `false`.
 * - ARIA Attributes: Boolean values are mapped to 'true'/'false' strings.
 * - Standard Attributes: Values are coerced to strings.
 *
 * Security: Protocol Validation
 * Validates 'href' and 'src' attributes against dangerous URL protocols to
 * mitigate potential XSS vectors.
 *
 * @param element - The target HTMLElement.
 * @param attrMap - A record mapping attribute names to reactive values.
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
        const meta = metaMap[name];
        if (!meta) continue;

        const attrVal = Option.unwrapOr(
          Option.map(Option.fromNullable(value), (val) => {
            if (val === true) return meta.isAria ? 'true' : name;
            if (val === false) return meta.isAria ? 'false' : null;
            return String(val);
          }),
          null
        );

        // 2. Validate and Apply
        if (attrVal !== null && isDangerousUrl(name, attrVal as string)) {
          console.warn(`${SYSTEM_BINDING.PREFIX} ${SYSTEM_SECURITY.ERRORS.BLOCKED_PROTOCOL(name)}`);
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
    },
    'attr'
  );
}

/**
 * Binds DOM properties directly to reactive sources.
 *
 * Security: Blocks sensitive properties (e.g., `innerHTML`, event handlers)
 * and validates URL-based properties to prevent prototype pollution or XSS.
 *
 * @param element - The target HTMLElement.
 * @param propMap - A record mapping property names to reactive values.
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
          console.warn(`${SYSTEM_BINDING.PREFIX} ${SYSTEM_SECURITY.ERRORS.BLOCKED_PROTOCOL(name)}`);
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
 * Manages element visibility based on a reactive condition.
 *
 * Logic: Layout Preservation
 * Transitions between 'visible' and 'hidden' states while preserving the
 * element's original 'display' mode (e.g., flex, grid) when restored.
 *
 * @param element - The target HTMLElement.
 * @param condition - The reactive boolean condition governing visibility.
 * @param invert - If true, hides the element when the condition is met.
 * @internal
 */
export function bindVisibility(
  element: HTMLElement,
  condition: AsyncReactiveValue<boolean>,
  invert: boolean
): void {
  // Capture initial display state, excluding 'none'.
  let baseDisplay = element.style.display === 'none' ? '' : element.style.display;

  registerReactiveEffect(
    element,
    condition,
    (value) => {
      const isVisible = invert !== !!value;
      const current = element.style.display;

      // Data-centric state application:
      if (isVisible) {
        if (current === 'none') {
          element.style.display = baseDisplay;
        }
      } else if (current !== 'none') {
        baseDisplay = current;
        element.style.display = 'none';
      }
    },
    invert ? 'hide' : 'show'
  );
}

/**
 * Binds a form control's value to a writable atom.
 *
 * When to use:
 * - To implement two-way synchronization for inputs, selects, and textareas.
 *
 * @param element - The form control element.
 * @param atom - The writable atom to synchronize with.
 * @param options - Configuration for debouncing and transformation.
 * @internal
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
 * Logic: Native radio buttons do not fire 'change' events when they are
 * unchecked by the selection of another radio button in the same group.
 * This utility manually triggers synchronization for the entire group
 * to ensure reactive consistency.
 *
 * @param element - The radio input element that was recently selected.
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
 * Binds a checkbox or radio button's checked state to a writable atom.
 *
 * @param element - The target input element.
 * @param atom - The writable atom to synchronize with the checked state.
 * @internal
 */
export function bindChecked(element: HTMLElement, atom: WritableAtom<boolean>): void {
  if (!(element instanceof HTMLInputElement)) {
    console.warn(`${SYSTEM_BINDING.PREFIX} atomChecked called on non-input element`);
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
          debug.domUpdated(SYSTEM_BINDING.PREFIX, inputElement, 'checked', isChecked);
          if (isChecked) syncRadios(inputElement);
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
