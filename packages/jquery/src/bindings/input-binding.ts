import { effect, untracked } from '@but212/atom-effect';
import { ERROR_MESSAGES, INPUT_DEFAULTS, LOG_PREFIXES } from '@/constants';
import { INTERNAL_HANDLER } from '@/core/jquery-patch';
import type { EffectObject, ValOptions, WritableAtom } from '@/types';
import { BindingFlags } from '@/types';
import { debug } from '@/utils/debug';

// Monotonically increasing counter used to generate per-instance event
// namespaces, preventing cleanup of sibling bindings on the same element.
let instanceCounter = 0;

type InputEl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * Marks a handler as library-internal so the jQuery patch skips batch() wrapping.
 * All handlers registered by InputBinding must be marked — unmarked handlers are
 * wrapped in batch() by the jQuery override, which is redundant and potentially
 * harmful here since InputBinding manages atom writes directly.
 */
function markInternal(fn: Function): void {
  (fn as unknown as Record<symbol, true>)[INTERNAL_HANDLER] = true;
}

class InputBinding<T> {
  private readonly $el: JQuery;
  private readonly el: InputEl;
  private readonly atom: WritableAtom<T>;
  private readonly isMultipleSelect: boolean;

  private readonly parse: (v: string) => T;
  private readonly format: (v: T) => string;
  private readonly equal: (a: T, b: T) => boolean;

  private flags = 0;
  private timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;

  /** Per-instance jQuery event namespace — prevents cleanup collisions. */
  private readonly ns: string;
  private readonly handleInput: () => void;

  constructor($el: JQuery, atom: WritableAtom<T>, options: ValOptions<T>) {
    this.$el = $el;
    this.el = $el[0] as InputEl;
    this.atom = atom;
    this.isMultipleSelect = this.el.tagName === 'SELECT' && (this.el as HTMLSelectElement).multiple;
    this.ns = `.atomBind-${++instanceCounter}`;

    const debounce = options.debounce ?? 0;

    this.parse = options.parse ?? ((v: string) => v as unknown as T);
    this.format =
      options.format ??
      ((v: T) => {
        if (this.isMultipleSelect) {
          return (Array.isArray(v) ? v : v ? [String(v)] : []).join(',');
        }
        return String(v ?? '');
      });

    const baseEqual = options.equal ?? Object.is;
    this.equal = (a: T, b: T): boolean => {
      if (baseEqual(a, b)) return true;
      if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((val, i) => Object.is(val, b[i]));
      }
      return false;
    };

    if (debounce > 0) {
      this.handleInput = () => {
        if (this.flags & BindingFlags.Composing) return;
        clearTimeout(this.timeoutId);
        this.timeoutId = setTimeout(() => this.syncAtomFromDom(), debounce);
      };
    } else {
      this.handleInput = () => {
        if (!(this.flags & BindingFlags.Composing)) this.syncAtomFromDom();
      };
    }

    [
      this.handleFocus,
      this.handleBlur,
      this.handleCompositionStart,
      this.handleCompositionEnd,
      this.handleInput,
    ].forEach(markInternal);

    this.bindEvents(options.event ?? INPUT_DEFAULTS.EVENT);
  }

  // --- Event Handlers ---

  private readonly handleCompositionStart = () => {
    this.flags |= BindingFlags.Composing;
  };

  private readonly handleCompositionEnd = () => {
    this.flags &= ~BindingFlags.Composing;
    this.handleInput();
  };

  private readonly handleFocus = () => {
    this.flags |= BindingFlags.Focused;
  };

  private readonly handleBlur = () => {
    this.flags &= ~BindingFlags.Focused;
    const wasComposing = !!(this.flags & BindingFlags.Composing);
    this.flags &= ~BindingFlags.Composing;

    this.flushPendingDebounce();

    if (wasComposing && this.timeoutId === undefined) {
      this.syncAtomFromDom();
    }

    this.normalizeDomValue();
  };

  // --- Helpers ---

  private flushPendingDebounce(): void {
    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
      this.syncAtomFromDom();
    }
  }

  private normalizeDomValue(): void {
    const val = this.atom.peek();
    const formatted = this.format(val);

    if (this.isMultipleSelect) {
      const current = (this.$el.val() as string[] | null) || [];
      const arr = Array.isArray(val) ? (val as unknown as string[]) : [];
      if (!this.equal(current as unknown as T, arr as unknown as T)) {
        this.$el.val(arr);
      }
    } else if (this.el.value !== formatted) {
      this.el.value = formatted;
    }
  }

  private syncAtomFromDom(): void {
    if (this.flags & BindingFlags.Busy) return;
    this.flags |= BindingFlags.SyncingToAtom;
    try {
      const raw = this.isMultipleSelect ? (this.$el.val() as string[] | null) || [] : this.el.value;
      const parsed = this.parse(raw as string);
      if (!this.equal(this.atom.peek(), parsed)) {
        this.atom.value = parsed;
      }
    } catch (e) {
      debug.warn(
        LOG_PREFIXES.BINDING,
        ERROR_MESSAGES.BINDING.PARSE_ERROR(e instanceof Error ? e.message : String(e)),
        e
      );
    } finally {
      this.flags &= ~BindingFlags.SyncingToAtom;
    }
  }

  public readonly syncDomFromAtom = () => {
    const val = this.atom.value;

    untracked(() => {
      const formatted = this.format(val);
      const currentVal = (this.isMultipleSelect
        ? (this.$el.val() as string[] | null) || []
        : this.el.value) as unknown as T;

      if (this.equal(currentVal, val)) return;

      const isFocused = !!(this.flags & BindingFlags.Focused);

      if (isFocused) {
        try {
          const parsedCurrent = this.isMultipleSelect ? currentVal : this.parse(this.el.value);
          if (this.equal(parsedCurrent, val)) return;
        } catch {}
      }

      this.flags |= BindingFlags.SyncingToDom;
      try {
        if (this.isMultipleSelect) {
          this.$el.val(val as unknown as string[]);
        } else if (
          isFocused &&
          (this.el instanceof HTMLInputElement || this.el instanceof HTMLTextAreaElement)
        ) {
          try {
            const start = this.el.selectionStart;
            const end = this.el.selectionEnd;
            this.el.value = formatted;
            const len = formatted.length;

            if (start !== null && end !== null) {
              this.el.setSelectionRange(start < len ? start : len, end < len ? end : len);
            }
          } catch {
            this.el.value = formatted;
          }
        } else {
          this.el.value = formatted;
        }
        if (debug.enabled) debug.domUpdated(LOG_PREFIXES.BINDING, this.$el, 'val', formatted);
      } finally {
        this.flags &= ~BindingFlags.SyncingToDom;
      }
    });
  };

  public readonly cleanup = () => {
    this.$el.off(this.ns);
    clearTimeout(this.timeoutId);
    this.timeoutId = undefined;
  };

  private bindEvents(eventName: string): void {
    const ns = this.ns;
    const namespacedEvents = eventName
      .trim()
      .split(/\s+/)
      .map((e) => `${e}${ns}`)
      .join(' ');

    this.$el
      .on(`focus${ns}`, this.handleFocus)
      .on(`blur${ns}`, this.handleBlur)
      .on(`compositionstart${ns}`, this.handleCompositionStart)
      .on(`compositionend${ns}`, this.handleCompositionEnd)
      .on(namespacedEvents, this.handleInput);
  }
}

/**
 * Applies two-way data binding between a writable atom and an input element.
 */
export function applyInputBinding<T>(
  $el: JQuery,
  atom: WritableAtom<T>,
  options: ValOptions<T>
): { fx: EffectObject; cleanup: () => void } {
  let b: InputBinding<T> | null = new InputBinding($el, atom, options);
  return {
    fx: effect(b.syncDomFromAtom),
    cleanup: () => {
      if (b) {
        b.cleanup();
        b = null;
      }
    },
  };
}
