import { effect, untracked } from '@but212/atom-effect';
import { INPUT_DEFAULTS, LOG_PREFIXES } from '@/constants';
import { INTERNAL_HANDLER } from '@/core/jquery-patch';
import type { EffectObject, ValOptions, WritableAtom } from '@/types';
import { BindingFlags } from '@/types';
import { debug } from '@/utils/debug';

let instanceCounter = 0;
type FormElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * Marks a function as an internal atom-effect handler.
 *
 * Reason: Bypasses the global jQuery batching patch to prevent redundant update cycles
 * since synchronization is already gated by internal bitmask flags.
 */
function markInternal(handlerFunction: Function): void {
  (handlerFunction as unknown as Record<symbol, boolean>)[INTERNAL_HANDLER] = true;
}

/**
 * Internal engine for two-way data binding between DOM inputs and reactive Atoms.
 *
 * Optimization: Specializes read/write/equal/format strategies at construction time
 * to ensure monomorphic execution paths, avoiding branching in high-frequency sync loops.
 */
class InputBinding<T> {
  private readonly namespace = `.atomBind-${++instanceCounter}`;
  private readonly readValue: () => T;
  private readonly writeToDom: (value: T, formatted: string) => void;
  private readonly areEqual: (first: T, second: T) => boolean;
  private readonly formatValue: (value: T) => string;

  private flags = BindingFlags.None;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly $element: JQuery,
    private readonly atom: WritableAtom<T>,
    private readonly options: ValOptions<T>
  ) {
    const element = $element[0] as FormElement;
    const isMultipleSelect =
      element.tagName === 'SELECT' && (element as HTMLSelectElement).multiple;
    const isTextControl = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';

    const parse = options.parse ?? ((value: string) => value as unknown as T);
    const baseEqual = options.equal ?? Object.is;

    // Optimization: Branching is handled once here instead of every sync cycle.
    if (isMultipleSelect) {
      this.readValue = () => (($element.val() as string[]) || []) as unknown as T;
      this.writeToDom = (value) => {
        $element.val(value as unknown as string[]);
      };
      this.areEqual = (a, b) => {
        if (baseEqual(a, b)) return true;
        return (
          Array.isArray(a) &&
          Array.isArray(b) &&
          a.length === b.length &&
          a.every((v, i) => Object.is(v, b[i]))
        );
      };
      this.formatValue =
        options.format ?? ((v: unknown) => (Array.isArray(v) ? v : v ? [String(v)] : []).join(','));
    } else {
      this.readValue = () => parse(element.value);
      this.writeToDom = (_, formatted) => {
        // Logic: Cursor preservation prevents focus loss or "jumping" when updating focused text controls.
        if (isTextControl && document.activeElement === element) {
          const input = element as HTMLInputElement;
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
          element.value = formatted;
        }
      };
      this.areEqual = baseEqual;
      this.formatValue = options.format ?? ((v: T) => String(v ?? ''));
    }

    this.initializeEvents();
  }

  private initializeEvents(): void {
    const namespace = this.namespace;
    const debounce = this.options.debounce ?? 0;

    const syncToAtomDelegate = () => {
      if (!(this.flags & BindingFlags.Composing)) this.syncToAtom();
    };

    const handleInput =
      debounce > 0
        ? () => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(syncToAtomDelegate, debounce);
          }
        : syncToAtomDelegate;

    [
      this.handleFocus,
      this.handleBlur,
      this.handleCompositionStart,
      this.handleCompositionEnd,
      handleInput,
    ].forEach(markInternal);

    const eventNames = (this.options.event ?? INPUT_DEFAULTS.EVENT)
      .trim()
      .split(/\s+/)
      .map((name) => `${name}${namespace}`)
      .join(' ');

    this.$element
      .on(`focus${namespace}`, this.handleFocus)
      .on(`blur${namespace}`, this.handleBlur)
      .on(`compositionstart${namespace}`, this.handleCompositionStart)
      .on(`compositionend${namespace}`, this.handleCompositionEnd)
      .on(eventNames, handleInput);
  }

  private handleFocus = () => {
    this.flags |= BindingFlags.Focused;
  };

  private handleCompositionStart = () => {
    this.flags |= BindingFlags.Composing;
  };

  private handleCompositionEnd = () => {
    this.flags &= ~BindingFlags.Composing;
    this.syncToAtom();
  };

  private handleBlur = () => {
    const wasComposing = !!(this.flags & BindingFlags.Composing);
    this.flags &= ~(BindingFlags.Focused | BindingFlags.Composing);

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
      this.syncToAtom();
    } else if (wasComposing) {
      this.syncToAtom();
    }

    // Logic: Normalization ensures the DOM value strictly matches the Atom state when interactions end.
    const atomValue = this.atom.peek();
    if (!this.isDomUpToDate(atomValue)) {
      this.writeToDom(atomValue, this.formatValue(atomValue));
    }
  };

  private syncToAtom(): void {
    if (this.flags & BindingFlags.Busy) return;
    this.flags |= BindingFlags.SyncingToAtom;
    try {
      const domValue = this.readValue();
      if (!this.areEqual(this.atom.peek(), domValue)) {
        this.atom.value = domValue;
      }
    } finally {
      this.flags &= ~BindingFlags.SyncingToAtom;
    }
  }

  /**
   * Synchronizes the DOM element's value with the current Atom state.
   */
  public readonly syncToDom = () => {
    const atomValue = this.atom.value;
    // Logic: Bitmask gate prevents infinite feedback loops between DOM events and Atom updates.
    if (this.flags & BindingFlags.Busy) return;

    untracked(() => {
      if (this.isDomUpToDate(atomValue)) return;
      this.flags |= BindingFlags.SyncingToDom;
      try {
        const formatted = this.formatValue(atomValue);
        this.writeToDom(atomValue, formatted);
        debug.domUpdated(LOG_PREFIXES.BINDING, this.$element, 'val', formatted);
      } finally {
        this.flags &= ~BindingFlags.SyncingToDom;
      }
    });
  };

  private isDomUpToDate(atomValue: T): boolean {
    if (!this.areEqual(this.readValue(), atomValue)) return false;

    // Logic: While focused, we allow minor visual discrepancies (e.g., "1.0" vs "1") for input stability.
    if (this.flags & BindingFlags.Focused) return true;

    const element = this.$element[0] as FormElement;
    return this.formatValue(atomValue) === element.value;
  }

  /**
   * Removes all event listeners and clears pending timers.
   */
  public cleanup(): void {
    // Constraint: Namespacing prevents collisions with other bindings or user-defined event listeners.
    this.$element.off(this.namespace);
    clearTimeout(this.debounceTimer);
  }
}

/**
 * Applies a two-way value binding between a jQuery selection and a reactive Atom.
 *
 * When to use:
 * - To synchronize form inputs (text, textarea, select) with a WritableAtom.
 * - When cursor preservation or IME composition support is required for better UX.
 *
 * @param $element - The jQuery wrapped form element to bind.
 * @param atom - The WritableAtom to synchronize with the element value.
 * @param options - Configuration for debouncing, custom parsing, and formatting.
 *
 * @returns An object containing the reactive effect and a cleanup function.
 *
 * @example
 * const count = atom(0);
 * const { cleanup } = applyInputBinding($('#my-input'), count, {
 *   parse: (v) => parseInt(v, 10),
 *   debounce: 300
 * });
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
