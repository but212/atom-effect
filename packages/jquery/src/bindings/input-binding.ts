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
  private readonly isTextControl: boolean;

  private readonly parse: (v: string) => T;
  private readonly format: (v: T) => string;
  private readonly equal: (a: T, b: T) => boolean;
  private readonly readDom: () => T;
  private readonly getRawDom: () => string | string[];
  private readonly writeDom: (val: T, formatted: string) => void;

  /**
   * Internal state flags using bitwise operations for zero-overhead tracking.
   * Tracks focus, IME composition, and sync direction to prevent infinite loops.
   */
  private flags = 0;
  private timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;

  /** Per-instance jQuery event namespace — prevents cleanup collisions. */
  private readonly ns: string;
  private readonly handleInput: () => void;

  constructor($el: JQuery, atom: WritableAtom<T>, options: ValOptions<T>) {
    this.$el = $el;
    this.el = $el[0] as InputEl;
    this.atom = atom;
    const tagName = this.el.tagName;
    const isMultiple = tagName === 'SELECT' && (this.el as HTMLSelectElement).multiple;
    this.isMultipleSelect = isMultiple;
    this.isTextControl = tagName === 'INPUT' || tagName === 'TEXTAREA';
    this.ns = `.atomBind-${++instanceCounter}`;

    const debounce = options.debounce ?? 0;

    this.parse = options.parse ?? ((v: string) => v as unknown as T);

    // Specialize strategy functions at construction to avoid branches in sync hot-paths
    if (isMultiple) {
      this.format =
        options.format ?? ((v: T) => (Array.isArray(v) ? v : v ? [String(v)] : []).join(','));
      this.getRawDom = () => (this.$el.val() as string[] | null) || [];
      this.readDom = () => this.getRawDom() as unknown as T;
      this.writeDom = (val) => {
        this.$el.val(val as unknown as string[]);
      };
    } else {
      this.format = options.format ?? ((v: T) => String(v ?? ''));
      this.getRawDom = () => this.el.value;
      this.readDom = () => this.parse(this.el.value);

      if (this.isTextControl) {
        this.writeDom = (_val, formatted) => {
          if (this.flags & BindingFlags.Focused) {
            // --- Cursor Preservation Strategy ---
            try {
              const el = this.el as HTMLInputElement;
              const start = el.selectionStart;
              const end = el.selectionEnd;
              el.value = formatted;
              const len = formatted.length;
              if (start !== null && end !== null) {
                el.setSelectionRange(start < len ? start : len, end < len ? end : len);
              }
            } catch {
              this.el.value = formatted;
            }
          } else {
            this.el.value = formatted;
          }
        };
      } else {
        this.writeDom = (_, formatted) => {
          this.el.value = formatted;
        };
      }
    }

    const baseEqual = options.equal ?? Object.is;
    if (isMultiple) {
      this.equal = (a: T, b: T): boolean => {
        if (baseEqual(a, b)) return true;
        if (Array.isArray(a) && Array.isArray(b)) {
          const len = a.length;
          if (len !== b.length) return false;
          for (let i = 0; i < len; i++) {
            if (!Object.is(a[i], b[i])) return false;
          }
          return true;
        }
        return false;
      };
    } else {
      this.equal = baseEqual;
    }

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
    // We ignore input events while the user is still composing characters
    // (e.g., CJK character selection) to avoid syncing incomplete/partial data.
    this.flags |= BindingFlags.Composing;
  };

  private readonly handleCompositionEnd = () => {
    this.flags &= ~BindingFlags.Composing;
    // Trigger sync once composition is finished to capture the final character.
    this.handleInput();
  };

  private readonly handleFocus = () => {
    this.flags |= BindingFlags.Focused;
  };

  private readonly handleBlur = () => {
    this.flags &= ~BindingFlags.Focused;
    const wasComposing = !!(this.flags & BindingFlags.Composing);
    this.flags &= ~BindingFlags.Composing;

    // Ensure any pending debounced change is committed immediately on blur.
    this.flushPendingDebounce();

    // If composition was interrupted by blur (e.g. clicking away),
    // we must perform a final sync to stay consistent with the DOM.
    if (wasComposing && this.timeoutId === undefined) {
      this.syncAtomFromDom();
    }

    // Restore the strict formatted value from the atom.
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
    const raw = this.getRawDom();

    if (this.isMultipleSelect) {
      if (!this.equal(raw as unknown as T, val)) {
        this.writeDom(val, formatted);
      }
    } else if (raw !== formatted) {
      this.writeDom(val, formatted);
    }
  }

  private syncAtomFromDom(): void {
    if (this.flags & BindingFlags.Busy) return;
    this.flags |= BindingFlags.SyncingToAtom;
    try {
      const parsed = this.readDom();
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
      const raw = this.getRawDom();

      // Skip if raw DOM matches formatted string (or array for select-multiple)
      if (this.isMultipleSelect) {
        if (this.equal(raw as unknown as T, val)) return;
      } else if (raw === formatted) {
        return;
      }

      // If focused, check if it's already "functionally" equal via parse to avoid
      // overwriting while user is typing (e.g. typing "1.0" when atom is 1)
      if (this.flags & BindingFlags.Focused) {
        try {
          if (this.equal(this.readDom(), val)) return;
        } catch {
          // Ignore parse errors on check-only read
        }
      }

      this.flags |= BindingFlags.SyncingToDom;
      try {
        this.writeDom(val, formatted);
        debug.domUpdated(LOG_PREFIXES.BINDING, this.$el, 'val', formatted);
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
  let binding: InputBinding<T> | null = new InputBinding($el, atom, options);
  return {
    fx: effect(binding.syncDomFromAtom),
    cleanup: () => {
      if (binding) {
        binding.cleanup();
        binding = null;
      }
    },
  };
}
