import { effect, untracked } from '@but212/atom-effect';
import { ERROR_MESSAGES, INPUT_DEFAULTS, LOG_PREFIXES } from '@/constants';
import { INTERNAL_HANDLER } from '@/core/jquery-patch';
import type { EffectObject, ValOptions, WritableAtom } from '@/types';
import { BindingFlags } from '@/types';
import { debug } from '@/utils/debug';

let instanceCounter = 0;

type InputEl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * Marks a function as an internal atom-effect handler.
 * Used for debugging and filtering events in the registry.
 */
function markInternal(fn: Function): void {
  (fn as unknown as Record<symbol, true>)[INTERNAL_HANDLER] = true;
}

/**
 * A robust engine for two-way data binding between form controls and WritableAtoms.
 *
 * Major UX challenges solved:
 * 1. Cursor Jumping: Restores selection ranges when updating focused text controls.
 * 2. IME Composition: Defers atom updates until a multi-stroke character (e.g., 한글) is finalized.
 * 3. Feedback Loops: Prevents DOM-to-Atom updates from triggering Atom-to-DOM updates.
 * 4. Multi-Select normalization: Handles array-based values for select[multiple] elements.
 */
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

  private flags = 0;

  private timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;

  private readonly ns: string;

  private readonly handleInput: () => void;

  constructor($el: JQuery, atom: WritableAtom<T>, options: ValOptions<T>) {
    this.$el = $el;
    this.el = $el[0] as InputEl;
    this.atom = atom;

    const tagName = this.el.tagName;
    this.isMultipleSelect = tagName === 'SELECT' && (this.el as HTMLSelectElement).multiple;
    this.isTextControl = tagName === 'INPUT' || tagName === 'TEXTAREA';
    // Reason: Instance-specific namespace prevents accidental 'off()' interference.
    this.ns = `.atomBind-${++instanceCounter}`;

    const { parse, format, equal, readDom, getRawDom, writeDom } = this.initStrategies(options);
    this.parse = parse;
    this.format = format;
    this.equal = equal;
    this.readDom = readDom;
    this.getRawDom = getRawDom;
    this.writeDom = writeDom;

    const debounce = options.debounce ?? 0;
    if (debounce > 0) {
      this.handleInput = () => {
        // Caution: Never sync while the user is still composing an IME character.
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

  /** Selects optimized read/write logic based on the element's behavior. */
  private initStrategies(options: ValOptions<T>) {
    const parse = options.parse ?? ((v: string) => v as unknown as T);
    const baseEqual = options.equal ?? Object.is;

    if (this.isMultipleSelect) {
      // Logic: multiple selects map to arrays of strings.
      const format =
        options.format ?? ((v: T) => (Array.isArray(v) ? v : v ? [String(v)] : []).join(','));

      return {
        parse,
        format,
        getRawDom: () => (this.$el.val() as string[] | null) || [],
        readDom: () => ((this.$el.val() as string[] | null) || []) as unknown as T,
        writeDom: (val: T) => {
          this.$el.val(val as unknown as string[]);
        },
        equal: (a: T, b: T): boolean => {
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
        },
      };
    }

    const format = options.format ?? ((v: T) => String(v ?? ''));
    const getRawDom = () => this.el.value;
    const readDom = () => parse(this.el.value);
    const writeDom = this.isTextControl
      ? (_val: T, formatted: string) => this.writeTextValue(formatted)
      : (_: T, formatted: string) => {
          this.el.value = formatted;
        };

    return { parse, format, equal: baseEqual, readDom, getRawDom, writeDom };
  }

  /**
   * Updates the value while attempting to keep the cursor in the same position.
   * Necessity: Updating 'el.value' while an input is focused normally drops the cursor to the end.
   */
  private writeTextValue(formatted: string): void {
    const el = this.el as HTMLInputElement;
    if (this.flags & BindingFlags.Focused) {
      try {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        el.value = formatted;
        const len = formatted.length;
        if (start !== null && end !== null) {
          // Keep the selection within the boundaries of the new value
          el.setSelectionRange(Math.min(start, len), Math.min(end, len));
        }
      } catch {
        el.value = formatted;
      }
    } else {
      el.value = formatted;
    }
  }

  private readonly handleCompositionStart = () => {
    this.flags |= BindingFlags.Composing;
  };

  private readonly handleCompositionEnd = () => {
    this.flags &= ~BindingFlags.Composing;
    // Finalize the last character change now that composition is done.
    this.handleInput();
  };

  private readonly handleFocus = () => {
    this.flags |= BindingFlags.Focused;
  };

  private readonly handleBlur = () => {
    this.flags &= ~BindingFlags.Focused;
    const wasComposing = !!(this.flags & BindingFlags.Composing);
    this.flags &= ~BindingFlags.Composing;

    const flushed = this.flushPendingDebounce();

    // If focus is lost while still composing (e.g. clicking away), force a sync.
    if (wasComposing && !flushed) {
      this.syncAtomFromDom();
    }

    this.normalizeDomValue();
  };

  private flushPendingDebounce(): boolean {
    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
      this.syncAtomFromDom();
      return true;
    }
    return false;
  }

  /** Ensures the DOM value strictly matches the Atom state when interactions end. */
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

  /** Propagates the DOM value back to the Atom. */
  private syncAtomFromDom(): void {
    // Prevent recursive updates if the Atom sync was triggered by an Atom-to-DOM sync.
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

  /**
   * Reactive effect that updates the DOM whenever the Atom value changes.
   * This method is designed to be passed to the effect() function.
   */
  public readonly syncDomFromAtom = () => {
    const val = this.atom.value;

    if (this.flags & BindingFlags.Busy) return;

    untracked(() => {
      if (this.isDomUpToDate(val)) return;

      const formatted = this.format(val);
      this.flags |= BindingFlags.SyncingToDom;
      try {
        this.writeDom(val, formatted);
        debug.domUpdated(LOG_PREFIXES.BINDING, this.$el, 'val', formatted);
      } finally {
        this.flags &= ~BindingFlags.SyncingToDom;
      }
    });
  };

  private isDomUpToDate(atomVal: T): boolean {
    const raw = this.getRawDom();

    if (this.isMultipleSelect) {
      return this.equal(raw as unknown as T, atomVal);
    }

    const formatted = this.format(atomVal);
    if (raw === formatted) return true;

    // While focused, the 'raw' value in DOM might technically differ from
    // formatted version due to user typing, so we check the 'parsed' version for logical equality.
    if (this.flags & BindingFlags.Focused) {
      try {
        return this.equal(this.readDom(), atomVal);
      } catch {}
    }

    return false;
  }

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
 * Initializes a two-way input binding.
 *
 * Returns an EffectObject for the Atom-to-DOM sync and a
 * cleanup function to unbind DOM events.
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
