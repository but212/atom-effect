import { effect, untracked } from '@but212/atom-effect';
import { INPUT_DEFAULTS, LOG_PREFIXES } from '@/constants';
import { INTERNAL_HANDLER } from '@/core/jquery-patch';
import type { EffectObject, ValOptions, WritableAtom } from '@/types';
import { BindingFlags } from '@/types';
import { debug } from '@/utils/debug';

let instanceCounter = 0;
type FormElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * Marks a function as an internal atom-effect handler for debugging purposes.
 */
function markInternal(handlerFunction: Function): void {
  (handlerFunction as unknown as Record<symbol, true>)[INTERNAL_HANDLER] = true;
}

/**
 * Factory function that creates input/output strategies based on the element type.
 * This encapsulates specific DOM interaction logic for different form controls.
 */
function createStrategies<T>($element: JQuery, element: FormElement, options: ValOptions<T>) {
  const isMultipleSelect = element.tagName === 'SELECT' && (element as HTMLSelectElement).multiple;
  const isTextControl = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';
  const parse = options.parse ?? ((value: string) => value as unknown as T);
  const baseEqual = options.equal ?? Object.is;

  if (isMultipleSelect) {
    return {
      read: () => (($element.val() as string[] | null) || []) as unknown as T,
      write: (value: T) => {
        $element.val(value as unknown as string[]);
      },
      equal: (firstValue: T, secondValue: T) => {
        if (baseEqual(firstValue, secondValue)) return true;
        if (Array.isArray(firstValue) && Array.isArray(secondValue)) {
          return (
            firstValue.length === secondValue.length &&
            firstValue.every((item, index) => Object.is(item, secondValue[index]))
          );
        }
        return false;
      },
      format:
        options.format ??
        ((value: T) => (Array.isArray(value) ? value : value ? [String(value)] : []).join(',')),
    };
  }

  const format = options.format ?? ((value: T) => String(value ?? ''));
  return {
    read: () => parse(element.value),
    write: (_value: T, formatted: string) => {
      // Cursor preservation: Updating focused text controls should not reset selection.
      if (isTextControl && document.activeElement === element) {
        const inputElement = element as HTMLInputElement;
        try {
          const selectionStart = inputElement.selectionStart;
          const selectionEnd = inputElement.selectionEnd;
          inputElement.value = formatted;
          if (selectionStart !== null && selectionEnd !== null) {
            const currentLength = formatted.length;
            inputElement.setSelectionRange(
              Math.min(selectionStart, currentLength),
              Math.min(selectionEnd, currentLength)
            );
          }
        } catch {
          inputElement.value = formatted;
        }
      } else {
        element.value = formatted;
      }
    },
    equal: baseEqual,
    format,
  };
}

/**
 * Manages two-way data binding between a DOM input element and a reactive Atom.
 * Handles event listeners, debouncing, and state synchronization.
 */
class InputBinding<T> {
  private readonly strategies: ReturnType<typeof createStrategies<T>>;

  private flags = 0;

  private timeoutId?: ReturnType<typeof setTimeout> | undefined;

  private readonly namespace: string = `.atomBind-${++instanceCounter}`;

  constructor(
    private $element: JQuery,
    private atom: WritableAtom<T>,
    options: ValOptions<T>
  ) {
    const element = $element[0] as FormElement;
    this.strategies = createStrategies($element, element, options);

    const debounce = options.debounce ?? 0;
    const synchronize = () => {
      if (!(this.flags & BindingFlags.Composing)) this.synchronizeAtomFromDom();
    };

    const handleInput =
      debounce > 0
        ? () => {
            clearTimeout(this.timeoutId);
            this.timeoutId = setTimeout(synchronize, debounce);
          }
        : synchronize;

    [
      this.handleFocus,
      this.handleBlur,
      this.handleCompositionStart,
      this.handleCompositionEnd,
      handleInput,
    ].forEach(markInternal);

    this.bindEvents(options.event ?? INPUT_DEFAULTS.EVENT, handleInput);
  }

  private handleFocus = () => {
    this.flags |= BindingFlags.Focused;
  };

  private handleCompositionStart = () => {
    this.flags |= BindingFlags.Composing;
  };

  private handleCompositionEnd = () => {
    this.flags &= ~BindingFlags.Composing;
    this.synchronizeAtomFromDom();
  };

  private handleBlur = () => {
    const wasComposing = this.flags & BindingFlags.Composing;
    this.flags &= ~(BindingFlags.Focused | BindingFlags.Composing);

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
      this.synchronizeAtomFromDom();
    } else if (wasComposing) {
      this.synchronizeAtomFromDom();
    }
  };

  /**
   * Reads the current DOM value and updates the Atom if it has changed.
   */
  private synchronizeAtomFromDom(): void {
    if (this.flags & BindingFlags.Busy) return;
    this.flags |= BindingFlags.SyncingToAtom;
    try {
      const parsedValue = this.strategies.read();
      if (!this.strategies.equal(this.atom.peek(), parsedValue)) {
        this.atom.value = parsedValue;
      }
    } finally {
      this.flags &= ~BindingFlags.SyncingToAtom;
    }
  }

  /**
   * Synchronizes the DOM element's value with the current Atom state.
   * Designed to be executed within a reactive effect.
   */
  public readonly synchronizeDomFromAtom = () => {
    const atomValue = this.atom.value;
    if (this.flags & BindingFlags.Busy) return;

    untracked(() => {
      this.flags |= BindingFlags.SyncingToDom;
      try {
        const formattedValue = this.strategies.format(atomValue);
        this.strategies.write(atomValue, formattedValue);
        debug.domUpdated(LOG_PREFIXES.BINDING, this.$element, 'val', formattedValue);
      } finally {
        this.flags &= ~BindingFlags.SyncingToDom;
      }
    });
  };

  /**
   * Removes all event listeners and clears pending timers.
   */
  public cleanup() {
    this.$element.off(this.namespace);
    clearTimeout(this.timeoutId);
  }

  /**
   * Attaches namespaced event listeners to the jQuery element.
   */
  private bindEvents(eventName: string, handleInput: () => void): void {
    const namespace = this.namespace;
    const namespacedEvents = eventName
      .trim()
      .split(/\s+/)
      .map((event) => `${event}${namespace}`)
      .join(' ');

    this.$element
      .on(`focus${namespace}`, this.handleFocus)
      .on(`blur${namespace}`, this.handleBlur)
      .on(`compositionstart${namespace}`, this.handleCompositionStart)
      .on(`compositionend${namespace}`, this.handleCompositionEnd)
      .on(namespacedEvents, handleInput);
  }
}

/**
 * Initializes a two-way input binding for a jQuery selection.
 * Returns a reactive effect object and a cleanup function.
 */
export function applyInputBinding<T>(
  $element: JQuery,
  atom: WritableAtom<T>,
  options: ValOptions<T>
): { reactiveEffect: EffectObject; cleanup: () => void } {
  const binding = new InputBinding($element, atom, options);
  return {
    reactiveEffect: effect(binding.synchronizeDomFromAtom),
    cleanup: () => binding.cleanup(),
  };
}
