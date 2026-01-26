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

  // Core sync: DOM → Atom (defined early for handlers)
  const syncAtomFromDom = () => {
    if (state.flags & BindingFlags.Busy) return;

    state.flags |= BindingFlags.SyncingToAtom;
    try {
      atom.value = parse($el.val() as string);
    } finally {
      state.flags &= ~BindingFlags.SyncingToAtom;
    }
  };

  const onBlur = () => {
    // [Fix] Flush pending debounce before formatting to prevent data loss
    if (state.timeoutId) {
      clearTimeout(state.timeoutId);
      state.timeoutId = null;
      syncAtomFromDom();
    }

    state.flags &= ~BindingFlags.Focused;
    // Force formatting on blur to ensure clean display (now with latest value)
    const formatted = format(atom.value);
    if ($el.val() !== formatted) {
      $el.val(formatted);
    }
  };

  // Input handler with optional debounce
  const onInput = () => {
    if (state.flags & BindingFlags.Busy) return;

    if (debounceMs) {
      if (state.timeoutId) clearTimeout(state.timeoutId);
      state.timeoutId = window.setTimeout(syncAtomFromDom, debounceMs);
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

  // Cleanup handler
  const cleanup = () => {
    $el.off(handlers);
    if (state.timeoutId) clearTimeout(state.timeoutId);
  };

  // Core sync: Atom → DOM (Effect body)
  const effect = () => {
    const formatted = format(atom.value);
    const currentVal = $el.val() as string;

    // Update only if value differs
    if (currentVal !== formatted) {
      // Don't interrupt user input if parsed value matches
      if (state.flags & BindingFlags.Focused && equal(parse(currentVal), atom.value)) {
        return;
      }

      state.flags |= BindingFlags.SyncingToDom;
      try {
        // [Fix] Preserve cursor position when focused (external update scenario)
        if (state.flags & BindingFlags.Focused) {
          const input = $el[0] as HTMLInputElement | HTMLTextAreaElement;
          const { selectionStart: start, selectionEnd: end } = input;
          $el.val(formatted);
          // Clamp cursor position to new value length
          input.setSelectionRange(
            Math.min(start ?? formatted.length, formatted.length),
            Math.min(end ?? formatted.length, formatted.length)
          );
        } else {
          $el.val(formatted);
        }

        debug.domUpdated($el, 'val', formatted);
      } finally {
        state.flags &= ~BindingFlags.SyncingToDom;
      }
    }
  };

  return { effect, cleanup };
}
