import { debug } from './debug';
import type { InputBindingState, ValOptions, WritableAtom } from './types';
import { BindingFlags, createInputBindingState } from './types';

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
  const {
    debounce: debounceMs,
    event = 'input',
    parse = (v: string) => v as unknown as T,
    format = (v: T) => String(v ?? ''),
    equal = Object.is,
  } = options;

  const state: InputBindingState = createInputBindingState();
  const el = $el[0] as HTMLInputElement | HTMLTextAreaElement;

  // Core sync: DOM → Atom
  const syncAtomFromDom = () => {
    if (state.flags & BindingFlags.Busy) return;

    state.flags |= BindingFlags.SyncingToAtom;
    try {
      const currentRaw = el.value;
      const parsed = parse(currentRaw);
      // Avoid redundant atom updates to prevent unnecessary propagation
      if (!equal(atom.value, parsed)) {
        atom.value = parsed;
      }
    } finally {
      state.flags &= ~BindingFlags.SyncingToAtom;
    }
  };

  const onBlur = () => {
    // Flush pending debounce
    if (state.timeoutId) {
      clearTimeout(state.timeoutId);
      state.timeoutId = null;
      syncAtomFromDom();
    }

    state.flags &= ~BindingFlags.Focused;

    // Force formatting on blur
    const formatted = format(atom.value);
    if (el.value !== formatted) {
      el.value = formatted;
    }
  };

  // Input handler with optional debounce
  const onInput = () => {
    if (state.flags & BindingFlags.Busy) return;

    if (debounceMs) {
      if (state.timeoutId) clearTimeout(state.timeoutId);
      state.timeoutId = setTimeout(syncAtomFromDom, debounceMs);
    } else {
      syncAtomFromDom();
    }
  };

  const handlers = {
    compositionstart: () => {
      state.flags |= BindingFlags.Composing;
    },
    compositionend: () => {
      state.flags &= ~BindingFlags.Composing;
      syncAtomFromDom();
    },
    focus: () => {
      state.flags |= BindingFlags.Focused;
    },
    blur: onBlur,
    [event]: onInput,
    change: onInput,
  };

  $el.on(handlers);

  const cleanup = () => {
    $el.off(handlers);
    if (state.timeoutId) clearTimeout(state.timeoutId);
  };

  // Core sync: Atom → DOM (Effect body)
  const effect = () => {
    const val = atom.value;
    const formatted = format(val);
    const currentVal = el.value;

    // 1. Skip if already synchronized
    if (currentVal === formatted) return;

    // 2. Skip if focused and current input parses to same value (don't interrupt user)
    if (state.flags & BindingFlags.Focused && equal(parse(currentVal), val)) {
      return;
    }

    state.flags |= BindingFlags.SyncingToDom;
    try {
      if (state.flags & BindingFlags.Focused) {
        // [Fix] Preserve cursor position when focused
        const { selectionStart: start, selectionEnd: end } = el;
        el.value = formatted;
        const len = formatted.length;
        el.setSelectionRange(Math.min(start ?? 0, len), Math.min(end ?? 0, len));
      } else {
        el.value = formatted;
      }

      debug.domUpdated($el, 'val', formatted);
    } finally {
      state.flags &= ~BindingFlags.SyncingToDom;
    }
  };

  return { effect, cleanup };
}
