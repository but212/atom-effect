import { batch } from '@but212/atom-effect';
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

  // IME composition support (CJK input)
  const onCompositionStart = () => {
    state.flags |= BindingFlags.Composing;
  };

  const onCompositionEnd = () => {
    state.flags &= ~BindingFlags.Composing;
    syncAtomFromDom();
  };

  $el.on('compositionstart', onCompositionStart);
  $el.on('compositionend', onCompositionEnd);

  // Focus tracking for smart formatting
  const onFocus = () => {
    state.flags |= BindingFlags.Focused;
  };

  // Core sync: DOM → Atom (defined early for blur flush)
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
    const input = $el[0] as HTMLInputElement | HTMLTextAreaElement;
    if (input && input.value !== formatted) {
      input.value = formatted;
    }
  };

  $el.on('focus', onFocus);
  $el.on('blur', onBlur);

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

  // Wrap event handlers with batch for optimization
  const batchedOnInput = () => batch(onInput);
  const batchedOnCompositionEnd = () => batch(onCompositionEnd);
  const batchedOnBlur = () => batch(onBlur);
  const batchedOnFocus = () => batch(onFocus);
  const batchedOnCompositionStart = () => batch(onCompositionStart);

  $el.on(event, batchedOnInput);
  $el.on('change', batchedOnInput);
  $el.on('compositionstart', batchedOnCompositionStart);
  $el.on('compositionend', batchedOnCompositionEnd);
  $el.on('focus', batchedOnFocus);
  $el.on('blur', batchedOnBlur);

  // Cleanup handler
  const cleanup = () => {
    $el.off(event, batchedOnInput);
    $el.off('change', batchedOnInput);
    $el.off('compositionstart', batchedOnCompositionStart);
    $el.off('compositionend', batchedOnCompositionEnd);
    $el.off('focus', batchedOnFocus);
    $el.off('blur', batchedOnBlur);
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
          const start = input.selectionStart;
          const end = input.selectionEnd;
          $el.val(formatted);
          // Clamp cursor position to new value length
          const maxPos = formatted.length;
          input.setSelectionRange(
            Math.min(start ?? maxPos, maxPos),
            Math.min(end ?? maxPos, maxPos)
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
