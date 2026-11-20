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
        } catch {
          // Retry the write without preserving the selection.
          element.value = formatted;
        }
        return;
      }
      element.value = formatted;
    },
    equal: (first, second, baseEqual) => baseEqual(first, second),
    format: (value, custom) => (custom ? custom(value) : String(value ?? '')),
  } as BindingStrategy<unknown, FormElement>,
} as const;

let instanceCounter = 0;

/** Access relative to the particular form binding requesting the operation. */
export type FieldAccess = 'owned' | 'suspended' | 'blocked';

/**
 * Prepares a two-way input binding so its owner can register disposal before `start()`.
 */
export function createInputBinding<T>(
  target: HTMLElement,
  atom: WritableAtom<T>,
  options: ValOptions<T>,
  formField?: { getAccess(): FieldAccess; commit(value: T): void }
): { start(): void; replay(force?: boolean): void; dispose(): void } | undefined {
  const tagName = target.tagName.toLowerCase();
  if (
    !(SYSTEM_BINDING.VALID_INPUT_TAGS as readonly string[]).includes(tagName) &&
    !tagName.includes('-')
  ) {
    debug.warn(SYSTEM_BINDING.PREFIX, SYSTEM_BINDING.ERRORS.INVALID_INPUT_ELEMENT(tagName));
    return;
  }
  const element = target as FormElement;
  const eventNamespace = `.atomBind-${++instanceCounter}`;

  // Logic: Monomorphic Dispatch
  // Strategies are resolved at initialization time to ensure monomorphic
  // execution paths in high-frequency synchronization loops.
  const isMultipleSelect = element.tagName === 'SELECT' && (element as HTMLSelectElement).multiple;
  const strategy = (
    isMultipleSelect ? STRATEGIES.multipleSelect : STRATEGIES.default
  ) as BindingStrategy<T>;

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let reactiveEffect: EffectObject | undefined;
  let pendingSync = false;
  let isInternalWrite = false;
  let disposed = false;

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

  const canCommit = () => !disposed && (!formField || formField.getAccess() === 'owned');
  const syncToAtom = () => {
    if (disposed || isInternalWrite) return;
    try {
      if (!canCommit()) return;
      const domValue = readValue();
      if (!areEqual(atom.peek(), domValue) && !disposed) {
        if (formField) formField.commit(domValue);
        else atom.value = domValue;
      }
    } catch (error) {
      debug.warn(SYSTEM_BINDING.PREFIX, 'syncToAtom failed:', error);
    }
  };

  const syncToDom = () => {
    if (disposed) return;
    pendingSync = false;
    const atomValue = atom.value;
    if (disposed) return;
    untracked(() => {
      const access = formField?.getAccess();
      if (access === 'blocked') {
        pendingSync = true;
        return;
      }
      if (isDomUpToDate(atomValue) || disposed) return;
      isInternalWrite = true;
      try {
        const formatted = formatValue(atomValue);
        // Formatting can move or rename a field without immediately disposing its binding.
        if (disposed) return;
        if (formField?.getAccess() !== access) {
          pendingSync = true;
          return;
        }
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

    try {
      if (!canCommit()) return;
      const atomValue = atom.peek();
      if (!isDomUpToDate(atomValue) && canCommit()) {
        isInternalWrite = true;
        const formatted = formatValue(atomValue);
        if (canCommit()) writeToDom(atomValue, formatted);
      }
    } catch (error) {
      debug.warn(SYSTEM_BINDING.PREFIX, 'syncToDom (blur format) failed:', error);
    } finally {
      isInternalWrite = false;
    }
  };

  const debounce = options.debounce ?? SYSTEM_BINDING.INPUT_DEFAULTS.debounce;

  const handleInput = (event?: Event | JQuery.TriggeredEvent) => {
    if (disposed || isInternalWrite) return;

    const native = (event && 'originalEvent' in event ? event.originalEvent : event) as InputEvent;
    // Logic: Synchronization is deferred while an IME composition is active (Standard InputEvent).
    if (native?.isComposing) return;

    if (debounce > 0) {
      clearTimeout(debounceTimer);
      try {
        // The owner could move back before the timer fires; reject stale input at dispatch too.
        if (canCommit()) debounceTimer = setTimeout(syncToAtom, debounce);
      } catch (error) {
        debug.warn(SYSTEM_BINDING.PREFIX, 'syncToAtom failed:', error);
      }
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

  const $element = $(element);
  return {
    start() {
      if (disposed) return;
      $element.on(`blur${eventNamespace}`, handleBlur).on(eventNames, handleInput);
      if (disposed) {
        $element.off(eventNamespace);
        return;
      }
      // The initial evaluation can synchronously dispose the binding.
      const runningEffect = effect(syncToDom);
      if (disposed) runningEffect.dispose();
      else reactiveEffect = runningEffect;
    },
    replay(force = false) {
      if (!disposed && (force || pendingSync) && formField?.getAccess() !== 'blocked') {
        reactiveEffect?.run();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        reactiveEffect?.dispose();
      } finally {
        clearTimeout(debounceTimer);
        $element.off(eventNamespace);
      }
    },
  };
}
