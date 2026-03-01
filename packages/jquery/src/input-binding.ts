import { effect, untracked } from '@but212/atom-effect';
import { ERROR_MESSAGES, INPUT_DEFAULTS, LOG_PREFIXES } from './constants';
import { debug } from './debug';
import { INTERNAL_HANDLER } from './jquery-patch';
import type { EffectObject, ValOptions, WritableAtom } from './types';
import { BindingFlags } from './types';

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
  // $el: used only for jQuery event binding and debug.domUpdated — kept as a
  // field to avoid re-wrapping $el[0] on every call.
  // el:  raw DOM reference for hot-path property access (value, selectionStart,
  //      etc.) — avoids jQuery wrapper overhead on every input event.
  private readonly $el: JQuery;
  private readonly el: InputEl;
  private readonly atom: WritableAtom<T>;
  private readonly isMultipleSelect: boolean;

  // Hoisted fast local properties vs deep this.options.x lookups for hot paths.
  private readonly parse: (v: string) => T;
  private readonly format: (v: T) => string;
  private readonly equal: (a: T, b: T) => boolean;

  private flags = 0;
  // undefined instead of null so clearTimeout(this.timeoutId) is always safe
  // without a null-check (clearTimeout(undefined) is a no-op per spec).
  private timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;

  /** Per-instance jQuery event namespace — prevents cleanup collisions. */
  private readonly ns: string;

  // Declared here so TypeScript knows the field exists; assigned in the
  // constructor where the debounce branch decides which closure to use.
  // Must be readonly after construction — markInternal relies on the final
  // function reference being stable, which is ensured by calling it after
  // all handler assignments are complete.
  private readonly handleInput: () => void;

  constructor($el: JQuery, atom: WritableAtom<T>, options: ValOptions<T>) {
    this.$el = $el;
    this.el = $el[0] as InputEl;
    this.atom = atom;
    this.isMultipleSelect = this.el.tagName === 'SELECT' && (this.el as HTMLSelectElement).multiple;
    this.ns = `.atomBind-${++instanceCounter}`;

    const debounce = options.debounce ?? 0;
    const eventName = options.event ?? INPUT_DEFAULTS.EVENT;

    this.parse = options.parse ?? ((v: string) => v as unknown as T);
    this.format =
      options.format ??
      ((v: T) => {
        // Return array directly for <select multiple> instead of stringifying
        if (this.isMultipleSelect) {
          return (Array.isArray(v) ? v : v ? [String(v)] : []).join(',');
        }
        return String(v ?? '');
      });

    // Wrap user-provided or default equality with shallow array comparison
    // to support <select multiple> without leaking `unknown` into the public type.
    const baseEqual = options.equal ?? Object.is;
    this.equal = (a: T, b: T): boolean => {
      if (baseEqual(a, b)) return true;
      if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((val, i) => Object.is(val, b[i]));
      }
      return false;
    };

    // Optimization: pre-bind the appropriate input handler to avoid per-event
    // branching at runtime. The debounce branch produces a closure that clears
    // and resets a timer; the no-debounce branch calls syncAtomFromDom directly.
    if (debounce > 0) {
      this.handleInput = () => {
        if (this.flags & BindingFlags.Composing) return;
        clearTimeout(this.timeoutId);
        this.timeoutId = setTimeout(() => this.syncAtomFromDom(), debounce);
      };
    } else {
      this.handleInput = () => {
        if (this.flags & BindingFlags.Composing) return;
        this.syncAtomFromDom();
      };
    }

    // Mark all handlers so the jQuery patch skips batch() wrapping.
    // Done after all handler references are finalized (handleInput is assigned
    // above; the others are class-field arrow functions initialized before the
    // constructor body runs).
    markInternal(this.handleFocus);
    markInternal(this.handleBlur);
    markInternal(this.handleCompositionStart);
    markInternal(this.handleCompositionEnd);
    markInternal(this.handleInput);

    this.bindEvents(eventName);
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

    // FIX 4: Clear composing state securely when an element is unexpectedly blurred
    // while composition was active (e.g., click away during IME typing).
    const wasComposing = !!(this.flags & BindingFlags.Composing);
    this.flags &= ~BindingFlags.Composing;

    // Order matters: flush the pending debounce write BEFORE normalizing the
    // display value so that normalizeDomValue reads the atom state that
    // includes any value the user was typing.
    this.flushPendingDebounce();

    // If debounce === 0 and was composing, flushPendingDebounce wouldn't have synced Atom
    // (since timeoutId is undefined), so we must manually sync to prevent typed text from evaporating.
    if (wasComposing && this.timeoutId === undefined) {
      this.syncAtomFromDom();
    }

    this.normalizeDomValue();
  };

  // --- Blur helpers ---

  /**
   * Flushes any pending debounce timer immediately.
   * Called on blur so that a value the user finished typing is not lost
   * when focus moves away before the debounce delay expires.
   */
  private flushPendingDebounce(): void {
    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
      this.syncAtomFromDom();
    }
  }

  /**
   * Re-formats the current atom value into the input element on blur.
   * Ensures the displayed text matches the canonical format (e.g. trims trailing
   * spaces, applies number formatting) after the user finishes editing.
   */
  private normalizeDomValue(): void {
    const formatted = this.format(this.atom.peek());

    if (this.isMultipleSelect) {
      const currentVal = (this.$el.val() as string[] | null) || [];
      const formattedArr = Array.isArray(this.atom.peek()) ? this.atom.peek() : [];
      if (!this.equal(currentVal as unknown as T, formattedArr as unknown as T)) {
        this.$el.val(formattedArr as unknown as string[]);
      }
    } else if (this.el.value !== formatted) {
      this.el.value = formatted;
    }
  }

  // --- Sync Logic ---

  private syncAtomFromDom(): void {
    // BindingFlags.Busy covers Composing | SyncingToAtom | SyncingToDom.
    // SyncingToDom is included defensively: if a future synchronous code path
    // triggers handleInput during an Atom→DOM write, this guard prevents echo.
    if (this.flags & BindingFlags.Busy) return;

    this.flags |= BindingFlags.SyncingToAtom;
    try {
      // FIX 3: Support <select multiple> arrays
      let rawValue: string;
      if (this.isMultipleSelect) {
        rawValue = ((this.$el.val() as string[] | null) || []) as unknown as string;
      } else {
        rawValue = this.el.value;
      }

      const parsed = this.parse(rawValue);
      // peek() instead of .value: equality check in an event handler must not
      // register a dependency — only syncDomFromAtom (the effect body) tracks.
      if (!this.equal(this.atom.peek(), parsed)) {
        this.atom.value = parsed;
      }
    } catch (e) {
      // parse() threw (e.g. invalid input) — leave the atom unchanged.
      debug.warn(
        LOG_PREFIXES.BINDING,
        ERROR_MESSAGES.BINDING.PARSE_ERROR(e instanceof Error ? e.message : String(e)),
        e
      );
    } finally {
      this.flags &= ~BindingFlags.SyncingToAtom;
    }
  }

  // --- Public Interface ---

  /**
   * Reactive effect body (Atom → DOM).
   * Called by the `effect()` wrapper in `applyInputBinding` whenever the atom
   * value changes. Named `syncDomFromAtom` to distinguish it from the imported
   * `effect` function and to clarify the data-flow direction.
   *
   * TRACKING NOTE: only `this.atom.value` is intentionally tracked as a
   * reactive dependency. `format()`, `parse()`, and `equal()` run inside
   * `untracked()` so that user-supplied callbacks cannot accidentally subscribe
   * this effect to additional atoms — even if those callbacks internally read
   * reactive state.
   */
  public readonly syncDomFromAtom = () => {
    const val = this.atom.value;

    untracked(() => {
      const formatted = this.format(val);

      let currentVal: T;
      if (this.isMultipleSelect) {
        currentVal = ((this.$el.val() as string[] | null) || []) as unknown as T;
      } else {
        currentVal = this.el.value as unknown as T;
      }

      // Skip if already synchronised.
      if (this.equal(currentVal, val)) return;

      const isFocused = !!(this.flags & BindingFlags.Focused);

      // While focused, skip update if the current raw input already parses to
      // the same logical value — avoids interrupting in-progress user input.
      if (isFocused) {
        try {
          const parsedCurrent = this.isMultipleSelect
            ? currentVal // already T (string[]) from DOM
            : this.parse(this.el.value);
          if (this.equal(parsedCurrent, val)) return;
        } catch {
          // parse() threw on the current raw input (e.g. partially typed number).
          // Fall through and apply the formatted value.
        }
      }

      this.flags |= BindingFlags.SyncingToDom;
      try {
        if (this.isMultipleSelect) {
          this.$el.val(val as unknown as string[]);
        } else if (
          isFocused &&
          (this.el instanceof HTMLInputElement || this.el instanceof HTMLTextAreaElement)
        ) {
          // Preserve cursor position so external atom updates don't jump the caret.
          try {
            const start = this.el.selectionStart;
            const end = this.el.selectionEnd;

            this.el.value = formatted;
            const len = formatted.length;

            if (start !== null && end !== null) {
              this.el.setSelectionRange(start < len ? start : len, end < len ? end : len);
            }
          } catch (_e) {
            // FIX 1: Accessing selectionStart on types like 'number' throws an InvalidStateError DOMException.
            this.el.value = formatted;
          }
        } else {
          this.el.value = formatted;
        }

        debug.domUpdated(LOG_PREFIXES.BINDING, this.$el, 'val', formatted);
      } finally {
        this.flags &= ~BindingFlags.SyncingToDom;
      }
    });
  };

  public readonly cleanup = () => {
    // Remove only this instance's namespaced events — other bindings on the
    // same element are unaffected.
    this.$el.off(this.ns);
    clearTimeout(this.timeoutId);
    this.timeoutId = undefined;
  };

  private bindEvents(eventName: string): void {
    const ns = this.ns;
    // FIX 2: Apply namespace to every space-separated event type.
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
 * Used by both `$.fn.atomVal` (explicit) and `$.fn.atomBind({ val })` (implicit).
 *
 * @param $el     - jQuery-wrapped input, textarea, or select element.
 * @param atom    - Writable atom to keep in sync with the element's value.
 * @param options - Optional parse/format/debounce/event/equal configuration.
 * @returns `fx` — the registered reactive effect (Atom → DOM),
 *          `cleanup` — removes all event listeners and cancels pending timers.
 */
export function applyInputBinding<T>(
  $el: JQuery,
  atom: WritableAtom<T>,
  options: ValOptions<T>
): { fx: EffectObject; cleanup: () => void } {
  const binding = new InputBinding($el, atom, options);
  return { fx: effect(binding.syncDomFromAtom), cleanup: binding.cleanup };
}
