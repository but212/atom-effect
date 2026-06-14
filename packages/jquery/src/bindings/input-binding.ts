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

/** Represents a specialized synchronization strategy for different form element types. @internal */
interface BindingStrategy<T> {
  readonly read: (el: FormElement, parse?: (v: string) => T) => T;
  readonly write: (el: FormElement, value: T, formatted: string) => void;
  readonly equal: (a: T, b: T, baseEqual: (a: T, b: T) => boolean) => boolean;
  readonly format: (value: T, customFormat?: (v: T) => string) => string;
}

/**
 * Logic: Specialized Input Strategies
 * Registry of strategies for various form controls (Single vs Multiple Select).
 * @internal
 */
const STRATEGIES = {
  multipleSelect: {
    read: (el) =>
      el instanceof HTMLSelectElement ? Array.from(el.selectedOptions, (opt) => opt.value) : [],
    write: (el, value) => {
      $(el).val(value as string[]);
    },
    equal: (a, b, baseEqual) => {
      if (baseEqual(a, b)) return true;
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      return a.every((val, i) => Object.is(val, b[i]));
    },
    format: (v, custom) => (custom ? custom(v) : Array.isArray(v) ? v.join(',') : String(v ?? '')),
  } as BindingStrategy<unknown>,

  default: {
    read: (el, parse) => (parse ? parse(el.value) : el.value),
    write: (el, _, formatted) => {
      if (
        (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
        document.activeElement === el
      ) {
        try {
          const { selectionStart, selectionEnd } = el;
          el.value = formatted;
          if (selectionStart !== null && selectionEnd !== null) {
            const len = formatted.length;
            el.setSelectionRange(Math.min(selectionStart, len), Math.min(selectionEnd, len));
          }
          return;
        } catch {}
      }
      el.value = formatted;
    },
    equal: (a, b, baseEqual) => baseEqual(a, b),
    format: (v, custom) => (custom ? custom(v) : String(v ?? '')),
  } as BindingStrategy<unknown>,
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
 *   format: (val) => val.toUpperCase(),
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
  const areEqual = (a: T, b: T) => strategy.equal(a, b, options.equal ?? Object.is);
  const formatValue = (value: T) => strategy.format(value, options.format);

  const isDomUpToDate = (atomValue: T) => {
    if (!areEqual(readValue(), atomValue)) return false;

    // Logic: While the input is focused, we allow minor discrepancies (e.g.,
    // "1.0" in DOM vs 1 in Atom) to avoid disruptive formatting while the user is typing.
    if (document.activeElement === element) return true;

    return formatValue(atomValue) === element.value;
  };

  const syncToAtom = () => {
    if (isInternalWrite) return;
    try {
      const domValue = readValue();
      if (!areEqual(atom.peek(), domValue)) {
        atom.value = domValue;
      }
    } catch (err) {
      debug.warn(SYSTEM_BINDING.PREFIX, 'syncToAtom failed:', err);
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
      } catch (err) {
        debug.warn(SYSTEM_BINDING.PREFIX, 'syncToDom failed:', err);
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
    } catch (err) {
      debug.warn(SYSTEM_BINDING.PREFIX, 'syncToDom (blur format) failed:', err);
    } finally {
      isInternalWrite = false;
    }
  };

  const debounce = options.debounce ?? SYSTEM_BINDING.INPUT_DEFAULTS.debounce;

  const handleInput = (e?: Event | JQuery.TriggeredEvent) => {
    if (isInternalWrite) return;

    const native = (e && 'originalEvent' in e ? e.originalEvent : e) as InputEvent;
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
    .map((n) => n + eventNamespace)
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
