import { INPUT_DEFAULTS } from './constants';
import { debug } from './debug';
import type { ValOptions, WritableAtom } from './types';
import { BindingFlags } from './types';

/**
 * Applies two-way data binding configuration to an input element.
 * Shared logic used by both implicit (atomBind) and explicit (atomVal) bindings.
 *
 * @param $el - The jQuery element to bind.
 * @param atom - The target atom for two-way binding.
 * @param options - Binding options (parse, format, debounce, events).
 * @returns Object containing the effect function (for Atom -> DOM) and cleanup function.
 */
class InputBinding<T> {
  private readonly $el: JQuery;
  private readonly el: HTMLInputElement | HTMLTextAreaElement;
  private readonly atom: WritableAtom<T>;
  private readonly options: Required<ValOptions<T>>;

  // State from createInputBindingState
  private flags = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly ns = '.atomBind';

  constructor($el: JQuery, atom: WritableAtom<T>, options: ValOptions<T>) {
    this.$el = $el;
    this.el = $el[0] as HTMLInputElement | HTMLTextAreaElement;
    this.atom = atom;

    // Normalize options
    this.options = {
      debounce: options.debounce ?? 0,
      event: options.event ?? INPUT_DEFAULTS.EVENT,
      parse: options.parse ?? ((v: string) => v as unknown as T),
      format: options.format ?? ((v: T) => String(v ?? '')),
      equal: options.equal ?? Object.is,
    };

    this.bindEvents();
  }

  // --- Event Handlers (Bound) ---

  private readonly handleCompositionStart = () => {
    this.flags |= BindingFlags.Composing;
  };

  private readonly handleCompositionEnd = (e: JQuery.Event) => {
    this.flags &= ~BindingFlags.Composing;
    // Chromium: triggers input event after compositionend
    // Safari/Firefox: might need manual sync
    this.handleInput(e);
  };

  private readonly handleFocus = () => {
    this.flags |= BindingFlags.Focused;
  };

  private readonly handleBlur = () => {
    this.flags &= ~BindingFlags.Focused;

    // Flush pending debounce
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
      this.syncAtomFromDom();
    }

    // Force formatting on blur
    const formatted = this.options.format(this.atom.value);
    if (this.el.value !== formatted) {
      this.el.value = formatted;
    }
  };

  private readonly handleInput = (_e: JQuery.Event) => {
    // If composing, do nothing (wait for compositionend)
    if (this.flags & BindingFlags.Composing) return;

    if (this.options.debounce) {
      if (this.timeoutId) clearTimeout(this.timeoutId);
      this.timeoutId = setTimeout(() => this.syncAtomFromDom(), this.options.debounce);
    } else {
      this.syncAtomFromDom();
    }
  };

  // --- Sync Logic ---

  private syncAtomFromDom(): void {
    // Skip if system is busy or user is composing (IME)
    if (this.flags & BindingFlags.Busy || this.flags & BindingFlags.Composing) return;

    this.flags |= BindingFlags.SyncingToAtom;
    try {
      const currentRaw = this.el.value;
      const parsed = this.options.parse(currentRaw);

      // Only update if value actually changed
      if (!this.options.equal(this.atom.value, parsed)) {
        this.atom.value = parsed;
      }
    } finally {
      this.flags &= ~BindingFlags.SyncingToAtom;
    }
  }

  // --- Public Interface ---

  public readonly effect = () => {
    const val = this.atom.value;
    const formatted = this.options.format(val);
    const currentVal = this.el.value;

    // 1. Skip if already synchronized
    if (currentVal === formatted) return;

    // 2. Skip if focused and current input parses to same value (don't interrupt user)
    if (
      this.flags & BindingFlags.Focused &&
      this.options.equal(this.options.parse(currentVal), val)
    ) {
      return;
    }

    this.flags |= BindingFlags.SyncingToDom;
    try {
      // Preserve cursor if focused
      if (this.flags & BindingFlags.Focused) {
        const start = this.el.selectionStart;
        const end = this.el.selectionEnd;

        this.el.value = formatted;

        const len = formatted.length;
        if (start !== null && end !== null) {
          this.el.setSelectionRange(Math.min(start, len), Math.min(end, len));
        }
      } else {
        this.el.value = formatted;
      }

      debug.domUpdated(this.$el, 'val', formatted);
    } finally {
      this.flags &= ~BindingFlags.SyncingToDom;
    }
  };

  public readonly cleanup = () => {
    this.$el.off(this.ns); // Remove all namespaced events
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  };

  private bindEvents(): void {
    this.$el
      .on(`focus${this.ns}`, this.handleFocus)
      .on(`blur${this.ns}`, this.handleBlur)
      .on(`compositionstart${this.ns}`, this.handleCompositionStart)
      .on(`compositionend${this.ns}`, this.handleCompositionEnd);

    const eventName = this.options.event;
    if (eventName === 'input') {
      this.$el.on(`input${this.ns}`, this.handleInput);
    } else {
      this.$el.on(`${eventName}${this.ns}`, this.handleInput);
    }
  }
}

/**
 * Applies two-way data binding configuration to an input element.
 * Shared logic used by both implicit (atomBind) and explicit (atomVal) bindings.
 *
 * @param $el - The jQuery element to bind.
 * @param atom - The target atom for two-way binding.
 * @param options - Binding options (parse, format, debounce, events).
 * @returns Object containing the effect function (for Atom -> DOM) and cleanup function.
 */
export function applyInputBinding<T>(
  $el: JQuery,
  atom: WritableAtom<T>,
  options: ValOptions<T> = {}
): { effect: () => void; cleanup: () => void } {
  const binding = new InputBinding($el, atom, options);
  return { effect: binding.effect, cleanup: binding.cleanup };
}
