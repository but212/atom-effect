/**
 * @module AEJInputBinding
 *
 * Responsibility:
 * Orchestrates two-way reactive synchronization for form controls (input,
 * textarea, select). Handles IME composition, cursor stability,
 * and recursion prevention via closure-scoped bitmask flags.
 *
 * Design Intent:
 * Prefers closure-scoped bindings over class instances to eliminate class boilerplate,
 * ensure static context lookup optimization, and prevent dynamic hidden class polymorphism in V8.
 */

import { type EffectObject, effect, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { SYSTEM_BINDING } from '@/constants';
import { markInternal } from '@/core/symbols';
import type { ValOptions, WritableAtom } from '@/types';
import { debug } from '@/utils/debug';

type FormElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * Checks if the element type supports selection API.
 * Accessing selection properties on unsupported types (e.g. input[type=number]) throws.
 * @internal
 */
function supportsSelection(
  element: HTMLElement
): element is HTMLInputElement | HTMLTextAreaElement {
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    const type = element.type;
    return !type || /^(?:text|search|url|tel|password)$/.test(type);
  }
  return false;
}

/** Represents a specialized synchronization strategy for different form element types. @internal */
interface BindingStrategy<T, E extends FormElement = FormElement> {
  readonly read: (element: E, parse?: (value: string) => T) => T;
  readonly write: (element: E, value: T, formatted: string) => void;
  readonly equal: (first: T, second: T, baseEqual: (first: T, second: T) => boolean) => boolean;
  readonly format: (value: T, customFormat?: (value: T) => string) => string;
}

/**
 * Logic: Specialized Input Strategies
 * Registry of strategies for various form controls (Single vs Multiple Select).
 * @internal
 */
const STRATEGIES = {
  multipleSelect: {
    read: (element) => Array.from(element.selectedOptions, (opt) => opt.value),
    write: (element, value) => {
      $(element).val(value as string[]);
    },
    equal: (first, second, baseEqual) => {
      if (baseEqual(first, second)) return true;
      if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length)
        return false;
      return first.every((val, i) => Object.is(val, second[i]));
    },
    format: (formattedValue, customFormatter) =>
      customFormatter
        ? customFormatter(formattedValue)
        : Array.isArray(formattedValue)
          ? formattedValue.join(',')
          : String(formattedValue ?? ''),
  } as BindingStrategy<unknown, HTMLSelectElement>,

  default: {
    read: (element, parse) => (parse ? parse(element.value) : element.value),
    write: (element, _, formatted) => {
      if (supportsSelection(element) && document.activeElement === element) {
        try {
          const { selectionStart, selectionEnd } = element;
          element.value = formatted;
          if (selectionStart !== null && selectionEnd !== null) {
            const formattedLength = formatted.length;
            element.setSelectionRange(
              Math.min(selectionStart, formattedLength),
              Math.min(selectionEnd, formattedLength)
            );
          }
          return;
        } catch {}
      }
      element.value = formatted;
    },
    equal: (first, second, baseEqual) => baseEqual(first, second),
    format: (value, custom) => (custom ? custom(value) : String(value ?? '')),
  } as BindingStrategy<unknown, FormElement>,
} as const;

let instanceCounter = 0;

/**
 * Applies a two-way reactive binding to a form control element.
 *
 * When to use:
 * - When synchronizing a form control (input, textarea, select) with a `WritableAtom`.
 * - When custom parsing, formatting, or input debouncing is required.
 *
 * @param $element - The jQuery element wrap targeting a compatible form control.
 * @param atom - The reactive writable atom acting as the source of truth.
 * @param options - Configuration options for debouncing, custom events, parsing, and formatting.
 *
 * @returns An object containing the reactive effect and a cleanup function.
 *
 * @example
 * const name = $.atom('Jane Doe');
 * const binding = applyInputBinding($('#name-input'), name, {
 *   debounce: 100,
 *   format: (value) => value.toUpperCase(),
 * });
 * // To tear down bindings:
 * binding.cleanup();
 */
export function applyInputBinding<T>(
  $element: JQuery,
  atom: WritableAtom<T>,
  options: ValOptions<T>
): { reactiveEffect: EffectObject; cleanup: () => void } {
  const element = $element[0] as FormElement;
  const eventNamespace = `.atomBind-${++instanceCounter}`;

  // Logic: Monomorphic Dispatch
  // Strategies are resolved at initialization time to ensure monomorphic
  // execution paths in high-frequency synchronization loops.
  const isMultipleSelect = element.tagName === 'SELECT' && (element as HTMLSelectElement).multiple;
  const strategy = (
    isMultipleSelect ? STRATEGIES.multipleSelect : STRATEGIES.default
  ) as BindingStrategy<T>;

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let isInternalWrite = false;

  const readValue = () => strategy.read(element, options.parse);
  const writeToDom = (value: T, formatted: string) => strategy.write(element, value, formatted);
  const areEqual = (first: T, second: T) =>
    strategy.equal(first, second, options.equal ?? Object.is);
  const formatValue = (value: T) => strategy.format(value, options.format);

  const isDomUpToDate = (atomValue: T) => {
    if (!areEqual(readValue(), atomValue)) return false;

    // Logic: While the input is focused, we allow minor discrepancies (e.g.,
    // "1.0" in DOM vs 1 in Atom) to avoid disruptive formatting while the user is typing.
    if (document.activeElement === element) return true;

    // Multiple Select doesn't use formatting for DOM writes, so matching parsed values is sufficient.
    if (isMultipleSelect) return true;

    return formatValue(atomValue) === element.value;
  };

  const syncToAtom = () => {
    if (isInternalWrite) return;
    try {
      const domValue = readValue();
      if (!areEqual(atom.peek(), domValue)) {
        atom.value = domValue;
      }
    } catch (error) {
      debug.warn(SYSTEM_BINDING.PREFIX, 'syncToAtom failed:', error);
    }
  };

  const syncToDom = () => {
    const atomValue = atom.value;
    untracked(() => {
      if (isDomUpToDate(atomValue)) return;
      isInternalWrite = true;
      try {
        const formatted = formatValue(atomValue);
        writeToDom(atomValue, formatted);
        debug.domUpdated(SYSTEM_BINDING.PREFIX, $(element), 'val', formatted);
      } catch (error) {
        debug.warn(SYSTEM_BINDING.PREFIX, 'syncToDom failed:', error);
      } finally {
        isInternalWrite = false;
      }
    });
  };

  const handleBlur = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
    syncToAtom();

    // Logic: Value normalization ensures that the physical DOM value exactly
    // matches the reactive state once user interaction has concluded.
    const atomValue = atom.peek();
    try {
      if (!isDomUpToDate(atomValue)) {
        isInternalWrite = true;
        writeToDom(atomValue, formatValue(atomValue));
      }
    } catch (error) {
      debug.warn(SYSTEM_BINDING.PREFIX, 'syncToDom (blur format) failed:', error);
    } finally {
      isInternalWrite = false;
    }
  };

  const debounce = options.debounce ?? SYSTEM_BINDING.INPUT_DEFAULTS.debounce;

  const handleInput = (event?: Event | JQuery.TriggeredEvent) => {
    if (isInternalWrite) return;

    const native = (event && 'originalEvent' in event ? event.originalEvent : event) as InputEvent;
    // Logic: Synchronization is deferred while an IME composition is active (Standard InputEvent).
    if (native?.isComposing) return;

    if (debounce > 0) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(syncToAtom, debounce);
    } else {
      syncToAtom();
    }
  };

  markInternal(handleBlur);
  markInternal(handleInput);

  const rawEventNames = options.event ?? SYSTEM_BINDING.INPUT_DEFAULTS.event;
  const eventNames = rawEventNames
    .trim()
    .split(/\s+/)
    .map((name) => name + eventNamespace)
    .join(' ');

  $(element).on(`blur${eventNamespace}`, handleBlur).on(eventNames, handleInput);

  return {
    reactiveEffect: effect(syncToDom),
    cleanup: () => {
      $(element).off(eventNamespace);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    },
  };
}
