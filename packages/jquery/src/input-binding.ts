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

class InputBinding<T> {
  private readonly $el: JQuery;
  private readonly el: InputEl;
  private readonly atom: WritableAtom<T>;
  private readonly options: Required<ValOptions<T>>;

  private flags = 0;
  // undefined instead of null so clearTimeout(this.timeoutId) is always safe
  // without a null-check (clearTimeout(undefined) is a no-op per spec).
  private timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;

  /** Per-instance jQuery event namespace — prevents cleanup collisions. */
  private readonly ns = `.atomBind-${++instanceCounter}`;

  // Initialized in constructor based on options.debounce decision.
  private readonly handleInput: () => void;

  constructor($el: JQuery, atom: WritableAtom<T>, options: ValOptions<T>) {
    this.$el = $el;
    this.el = $el[0] as InputEl;
    this.atom = atom;

    const debounce = options.debounce ?? 0;
    this.options = {
      debounce,
      event: options.event ?? INPUT_DEFAULTS.EVENT,
      parse: options.parse ?? ((v: string) => v as unknown as T),
      format: options.format ?? ((v: T) => String(v ?? '')),
      equal: options.equal ?? Object.is,
    };

    // Optimization: Pre-bind the appropriate input handler to avoid per-event branching.
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

    // Mark all internal handlers so the jQuery patch skips batch() wrapping.
    // Inlining markInternal avoids helper call overhead.
    (this.handleFocus as unknown as Record<symbol, boolean>)[INTERNAL_HANDLER] = true;
    (this.handleBlur as unknown as Record<symbol, boolean>)[INTERNAL_HANDLER] = true;
    (this.handleCompositionStart as unknown as Record<symbol, boolean>)[INTERNAL_HANDLER] = true;
    (this.handleCompositionEnd as unknown as Record<symbol, boolean>)[INTERNAL_HANDLER] = true;
    (this.handleInput as unknown as Record<symbol, boolean>)[INTERNAL_HANDLER] = true;

    this.bindEvents();
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

    // Flush any pending debounce timer on blur.
    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
      this.syncAtomFromDom();
    }

    const formatted = this.options.format(this.atom.peek());
    if (this.el.value !== formatted) {
      this.el.value = formatted;
    }
  };

  // --- Sync Logic ---

  private syncAtomFromDom(): void {
    // BindingFlags.Busy covers Composing | SyncingToAtom | SyncingToDom.
    // SyncingToDom is included defensively: if a future synchronous code path
    // triggers handleInput during an Atom→DOM write, this guard prevents echo.
    if (this.flags & BindingFlags.Busy) return;

    this.flags |= BindingFlags.SyncingToAtom;
    try {
      const parsed = this.options.parse(this.el.value);
      // peek() instead of .value: equality check in an event handler must not
      // register a dependency — only syncDomFromAtom (the effect body) tracks.
      if (!this.options.equal(this.atom.peek(), parsed)) {
        this.atom.value = parsed;
      }
    } catch (e) {
      // parse() threw (e.g. invalid input) — leave the atom unchanged.
      debug.warn(LOG_PREFIXES.BINDING, `${ERROR_MESSAGES.PARSE_ERROR()}:`, e);
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
   */
  public readonly syncDomFromAtom = () => {
    // Only this.atom.value is the intended dependency of this effect.
    // Everything else — format(), parse(), equal(), el.value DOM reads —
    // runs untracked so user callbacks cannot accidentally subscribe this
    // effect to extra atoms.
    const val = this.atom.value;

    untracked(() => {
      const formatted = this.options.format(val);
      const currentVal = this.el.value;

      // Skip if already synchronised.
      if (currentVal === formatted) return;

      const isFocused = !!(this.flags & BindingFlags.Focused);

      // While focused, skip update if the current raw input already parses to
      // the same logical value — avoids interrupting in-progress user input.
      if (isFocused) {
        try {
          if (this.options.equal(this.options.parse(currentVal), val)) return;
        } catch {
          // parse() threw on the current raw input (e.g. partially typed number).
          // Fall through and apply the formatted value.
        }
      }

      this.flags |= BindingFlags.SyncingToDom;
      try {
        if (
          isFocused &&
          (this.el instanceof HTMLInputElement || this.el instanceof HTMLTextAreaElement)
        ) {
          // Preserve cursor position so external atom updates don't jump the caret.
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
    });
  };

  public readonly cleanup = () => {
    // Remove only this instance's namespaced events — other bindings on the
    // same element are unaffected.
    this.$el.off(this.ns);
    clearTimeout(this.timeoutId);
    this.timeoutId = undefined;
  };

  private bindEvents(): void {
    this.$el
      .on(`focus${this.ns}`, this.handleFocus)
      .on(`blur${this.ns}`, this.handleBlur)
      .on(`compositionstart${this.ns}`, this.handleCompositionStart)
      .on(`compositionend${this.ns}`, this.handleCompositionEnd)
      .on(`${this.options.event}${this.ns}`, this.handleInput);
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
