import { effect, untracked } from '@but212/atom-effect';
import { SYSTEM_BINDING } from '@/constants';
import { INTERNAL_HANDLER } from '@/core/jquery-patch';
import type { EffectObject, ValOptions, WritableAtom } from '@/types';
import { BindingFlags } from '@/types';
import { debug } from '@/utils/debug';

/** Internal counter used to generate unique event namespaces for each binding instance. */
let instanceCounter = 0;

/** Supported form control types. @internal */
type FormElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * Marks a function as an internal atom-effect handler.
 *
 * Reason: This bypasses the global jQuery batching patch, preventing redundant
 * update cycles. Since synchronization is already governed by internal
 * `BindingFlags` bitmasks, additional batching at the jQuery level is
 * unnecessary and would degrade performance.
 *
 * @param handlerFunction - The handler function to mark.
 * @internal
 */
function markInternal(handlerFunction: Function): void {
  (handlerFunction as unknown as Record<symbol, boolean>)[INTERNAL_HANDLER] = true;
}

/**
 * The internal engine coordinating two-way data synchronization between DOM
 * inputs and reactive atoms.
 *
 * Optimization: Read, write, equality, and formatting strategies are specialized
 * at construction time. This ensures monomorphic execution paths in V8 and
 * avoids expensive conditional branching within high-frequency synchronization loops.
 *
 * Logic:
 * - Composition Safety: Manages IME composition states (Korean, Japanese, Chinese)
 *   to prevent partial data synchronization during multi-stroke input.
 * - Cursor Stability: Maintains the user's cursor position during atom-to-DOM
 *   updates to ensure a seamless typing experience.
 * - Loop Protection: Utilizes bitmask-based flags to prevent infinite recursive
 *   updates between the DOM and the reactive graph.
 *
 * @internal
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

    // Optimization: Strategy selection occurs once here, allowing the hot-path
    // to execute specialized logic without repeated feature detection.
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
        // Logic: Cursor preservation logic is applied to focused text controls
        // to prevent the input from "jumping" or losing focus during reactive updates.
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

  /** Normalizes and attaches all required DOM event listeners for the binding. */
  private initializeEvents(): void {
    const namespace = this.namespace;
    const debounce = this.options.debounce ?? 0;

    const syncToAtomDelegate = () => {
      // Constraint: Synchronization is deferred while an IME composition is active.
      if (!(this.flags & BindingFlags.Composing)) {
        this.syncToAtom();
      }
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

    const eventNames = (this.options.event ?? SYSTEM_BINDING.INPUT_DEFAULTS.EVENT)
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

  /** Handles final synchronization and value normalization when the control loses focus. */
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

    // Logic: Value normalization ensures that the physical DOM value exactly
    // matches the reactive state once user interaction has concluded.
    const atomValue = this.atom.peek();
    if (!this.isDomUpToDate(atomValue)) {
      this.writeToDom(atomValue, this.formatValue(atomValue));
    }
  };

  /** Reads from the DOM and updates the reactive atom if the value has changed. */
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

  /** Synchronizes the atom's current value back to the physical DOM element. */
  public readonly syncToDom = () => {
    const atomValue = this.atom.value;
    // Logic: The bitmask gate is critical to prevent infinite feedback loops
    // triggered by DOM change events that occur during synchronization.
    if (this.flags & BindingFlags.Busy) return;

    untracked(() => {
      if (this.isDomUpToDate(atomValue)) return;
      this.flags |= BindingFlags.SyncingToDom;
      try {
        const formatted = this.formatValue(atomValue);
        this.writeToDom(atomValue, formatted);
        debug.domUpdated(SYSTEM_BINDING.PREFIX, this.$element, 'val', formatted);
      } finally {
        this.flags &= ~BindingFlags.SyncingToDom;
      }
    });
  };

  /** Determines if the current DOM value matches the reactive state. */
  private isDomUpToDate(atomValue: T): boolean {
    if (!this.areEqual(this.readValue(), atomValue)) return false;

    // Logic: While the input is focused, we allow minor discrepancies (e.g.,
    // "1.0" in DOM vs 1 in Atom) to avoid disruptive formatting while the user is typing.
    if (this.flags & BindingFlags.Focused) return true;

    const element = this.$element[0] as FormElement;
    return this.formatValue(atomValue) === element.value;
  }

  /** Cleans up all event listeners and timers associated with the binding. */
  public cleanup(): void {
    // Constraint: Strict namespacing prevents accidental removal of
    // user-defined listeners or handlers from other binding instances.
    this.$element.off(this.namespace);
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }
}

/**
 * Applies a two-way reactive binding to a form input element.
 *
 * This function handles text inputs, textareas, and select menus, ensuring
 * stability during IME composition and maintaining cursor positions during
 * background state updates.
 *
 * When to use:
 * - To synchronize a form control with a `WritableAtom` state.
 * - To implement debounced or custom-formatted input fields.
 *
 * @param $element - The jQuery collection containing the target form element.
 * @param atom - The writable atom to synchronize with.
 * @param options - Configuration for debouncing, event triggers, and data transformation.
 * @returns A handle containing the reactive effect and a cleanup function.
 *
 * @example
 * ```typescript
 * const name = atom('John');
 * const { cleanup } = applyInputBinding($('#name-input'), name, {
 *   debounce: 200,
 *   format: (v) => v.toUpperCase()
 * });
 * ```
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
