/**
 * @module AEJInputBinding
 *
 * Responsibility:
 * Orchestrates two-way reactive synchronization for form controls (input,
 * textarea, select). Handles IME composition, cursor stability,
 * and recursion prevention via bitmask flags.
 */

import { effect, untracked } from '@but212/atom-effect';
import { SYSTEM_BINDING } from '@/constants';
import { INTERNAL_HANDLER } from '@/core/symbols';
import type { EffectObject, ValOptions, WritableAtom } from '@/types';
import { BindingFlags } from '@/types';
import { debug } from '@/utils/debug';

/** Supported form control types. @internal */
type FormElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * Logic: Internal Handler Marking
 * Marks a function as an internal handler to bypass global jQuery patching.
 *
 * Why: Performance
 * Prevents redundant update cycles by skipping the `$.fn.on` batching
 * wrapper. Synchronization is already managed via internal `BindingFlags`.
 */
function markInternal(handlerFunction: Function): void {
  (handlerFunction as unknown as Record<symbol, boolean>)[INTERNAL_HANDLER] = true;
}

/** Represents a specialized synchronization strategy for different form element types. @internal */
interface BindingStrategy<T> {
  readonly read: (el: FormElement, $el: JQuery, parse?: (v: string) => T) => T;
  readonly write: (el: FormElement, $el: JQuery, value: T, formatted: string) => void;
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
    read: (el: FormElement): unknown => {
      if (!(el instanceof HTMLSelectElement)) return [];
      const options = el.selectedOptions;
      const result: string[] = [];
      for (let i = 0, len = options.length; i < len; i++) {
        result.push(options[i]!.value);
      }
      return result;
    },
    write: (_: FormElement, $el: JQuery, value: unknown) => {
      $el.val(value as string[]);
    },
    equal: (a: unknown, b: unknown, baseEqual: (a: unknown, b: unknown) => boolean) => {
      if (baseEqual(a, b)) return true;
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      for (let i = 0, len = a.length; i < len; i++) {
        if (!Object.is(a[i], b[i])) return false;
      }
      return true;
    },
    format: (v: unknown, custom?: (v: unknown) => string) => {
      if (custom) return custom(v);
      return Array.isArray(v) ? v.join(',') : String(v ?? '');
    },
  } as BindingStrategy<unknown>,

  default: {
    read: (el: FormElement, _: JQuery, parse?: (v: string) => unknown) => {
      return parse ? parse(el.value) : el.value;
    },
    write: (el: FormElement, _: JQuery, __: unknown, formatted: string) => {
      if (
        (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
        document.activeElement === el
      ) {
        const input = el as HTMLInputElement;
        try {
          const { selectionStart, selectionEnd } = input;
          input.value = formatted;
          if (selectionStart !== null && selectionEnd !== null) {
            const length = formatted.length;
            input.setSelectionRange(
              Math.min(selectionStart, length),
              Math.min(selectionEnd, length)
            );
          }
        } catch {
          input.value = formatted;
        }
      } else {
        el.value = formatted;
      }
    },
    equal: (a: unknown, b: unknown, baseEqual: (a: unknown, b: unknown) => boolean) =>
      baseEqual(a, b),
    format: (v: unknown, custom?: (v: unknown) => string) => {
      if (custom) return custom(v);
      return String(v ?? '');
    },
  } as BindingStrategy<unknown>,
} as const;

/**
 * Logic: Two-Way Synchronization Engine
 * Coordinates synchronization between DOM inputs and reactive atoms.
 *
 * Optimization: Monomorphic Dispatch
 * Strategies are resolved at construction time to ensure monomorphic
 * execution paths in high-frequency synchronization loops.
 *
 * Logic: Input Stability
 * - IME Safety: Defers sync during composition to prevent partial states.
 * - Cursor Stability: Preserves selection ranges during atom-to-DOM updates.
 * - Recursion Control: Uses bitmask flags to prevent infinite update cycles.
 *
 * @internal
 */
class InputBinding<T> {
  static #instanceCounter = 0;

  #$element: JQuery;
  #readValue: () => T;
  #writeToDom: (value: T, formatted: string) => void;
  #areEqual: (a: T, b: T) => boolean;
  #formatValue: (value: T) => string;
  #eventNamespace: string;
  #abortController = new AbortController();

  #flags = BindingFlags.None;
  #debounceTimer: ReturnType<typeof setTimeout> | undefined;

  #atom: WritableAtom<T>;
  #options: ValOptions<T>;

  constructor($element: JQuery, atom: WritableAtom<T>, options: ValOptions<T>) {
    this.#atom = atom;
    this.#options = options;
    this.#$element = $element;
    this.#eventNamespace = `.atomBind-${++InputBinding.#instanceCounter}`;
    const element = $element[0] as FormElement;
    const isMultipleSelect =
      element.tagName === 'SELECT' && (element as HTMLSelectElement).multiple;

    const strategy = (
      isMultipleSelect ? STRATEGIES.multipleSelect : STRATEGIES.default
    ) as BindingStrategy<T>;
    const parse = options.parse;
    const baseEqual = options.equal ?? Object.is;

    this.#readValue = () => (strategy as BindingStrategy<T>).read(element, this.#$element, parse);
    this.#writeToDom = (value, formatted) =>
      strategy.write(element, this.#$element, value, formatted);
    this.#areEqual = (a, b) => strategy.equal(a, b, baseEqual);
    this.#formatValue = (value) => strategy.format(value, options.format);

    this.#initializeEvents();
  }

  /** Normalizes and attaches all required DOM event listeners for the binding. */
  #initializeEvents(): void {
    const namespace = this.#eventNamespace;
    const debounce = this.#options.debounce ?? SYSTEM_BINDING.INPUT_DEFAULTS.debounce;

    const syncToAtomDelegate = (e?: Event | JQuery.TriggeredEvent) => {
      const native = (e && 'originalEvent' in e ? e.originalEvent : e) as InputEvent;
      // Logic: Synchronization is deferred while an IME composition is active (Standard InputEvent).
      if (native?.isComposing) return;
      this.#syncToAtom();
    };

    const handleInput =
      debounce > 0
        ? (e: JQuery.TriggeredEvent) => {
            clearTimeout(this.#debounceTimer);
            this.#debounceTimer = setTimeout(() => syncToAtomDelegate(e), debounce);
          }
        : syncToAtomDelegate;

    const onFocus = () => (this.#flags |= BindingFlags.Focused);
    const onBlur = () => this.#handleBlur();

    [onFocus, onBlur, handleInput].forEach(markInternal);

    const rawEventNames = this.#options.event ?? SYSTEM_BINDING.INPUT_DEFAULTS.event;
    const names = rawEventNames.trim().split(/\s+/);
    let eventNames = '';
    for (let i = 0, len = names.length; i < len; i++) {
      eventNames += (i > 0 ? ' ' : '') + names[i] + namespace;
    }

    // Use jQuery .on() for compatibility with $el.trigger().
    this.#$element
      .on(`focus${namespace}`, onFocus)
      .on(`blur${namespace}`, onBlur)
      .on(eventNames, handleInput as JQuery.EventHandler<HTMLElement>);
  }

  /** Handles final synchronization and value normalization when the control loses focus. */
  #handleBlur(): void {
    this.#flags &= ~BindingFlags.Focused;

    if (this.#debounceTimer) {
      clearTimeout(this.#debounceTimer);
      this.#debounceTimer = undefined;
    }
    this.#syncToAtom();

    // Logic: Value normalization ensures that the physical DOM value exactly
    // matches the reactive state once user interaction has concluded.
    const atomValue = this.#atom.peek();
    if (!this.#isDomUpToDate(atomValue)) {
      this.#writeToDom(atomValue, this.#formatValue(atomValue));
    }
  }

  /** Reads from the DOM and updates the reactive atom if the value has changed. */
  #syncToAtom(): void {
    if (this.#flags & BindingFlags.Busy) return;
    this.#flags |= BindingFlags.SyncingToAtom;
    try {
      const domValue = this.#readValue();
      if (!this.#areEqual(this.#atom.peek(), domValue)) {
        this.#atom.value = domValue;
      }
    } catch (err) {
      debug.warn(SYSTEM_BINDING.PREFIX, 'syncToAtom failed:', err);
    }
    this.#flags &= ~BindingFlags.SyncingToAtom;
  }

  /** Synchronizes the atom's current value back to the physical DOM element. */
  public readonly syncToDom = () => {
    const atomValue = this.#atom.value;
    // Logic: The bitmask gate is critical to prevent infinite feedback loops
    // triggered by DOM change events that occur during synchronization.
    if (this.#flags & BindingFlags.Busy) return;

    untracked(() => {
      if (this.#isDomUpToDate(atomValue)) return;
      this.#flags |= BindingFlags.SyncingToDom;
      try {
        const formatted = this.#formatValue(atomValue);
        this.#writeToDom(atomValue, formatted);
        debug.domUpdated(SYSTEM_BINDING.PREFIX, this.#$element, 'val', formatted);
      } catch (err) {
        debug.warn(SYSTEM_BINDING.PREFIX, 'syncToDom failed:', err);
      }
      this.#flags &= ~BindingFlags.SyncingToDom;
    });
  };

  /** Determines if the current DOM value matches the reactive state. */
  #isDomUpToDate(atomValue: T): boolean {
    if (!this.#areEqual(this.#readValue(), atomValue)) return false;

    // Logic: While the input is focused, we allow minor discrepancies (e.g.,
    // "1.0" in DOM vs 1 in Atom) to avoid disruptive formatting while the user is typing.
    if (this.#flags & BindingFlags.Focused) return true;

    const element = this.#$element[0] as FormElement;
    return this.#formatValue(atomValue) === element.value;
  }

  /** Cleans up all event listeners and timers associated with the binding. */
  public cleanup(): void {
    // Logic: Multiple cleanup mechanisms for maximum resilience.
    this.#$element.off(this.#eventNamespace);
    this.#abortController.abort();
    if (this.#debounceTimer) {
      clearTimeout(this.#debounceTimer);
    }
  }
}

/**
 * Logic: Input Binding Application
 * Applies a two-way reactive binding to a form input element.
 *
 * When to use:
 * - Synchronize a form control with a `WritableAtom`.
 * - Implement debounced or custom-formatted input fields.
 */
export function applyInputBinding<T>(
  $element: JQuery,
  atom: WritableAtom<T>,
  options: ValOptions<T>
): { reactiveEffect: EffectObject; cleanup: () => void } {
  const binding = new InputBinding($element, atom, options);
  return {
    reactiveEffect: effect(binding.syncToDom),
    cleanup: () => binding.cleanup(),
  };
}
