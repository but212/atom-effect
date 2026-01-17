import { batch } from '@but212/atom-effect';
import type { InputBindingState, ValOptions, WritableAtom } from './types';
import { createInputBindingState } from './types';
import { debug } from './debug';

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
  } = options;

  const state: InputBindingState = createInputBindingState();

  // IME composition support (CJK input)
  const onCompositionStart = () => {
    state.phase = 'composing';
  };

  const onCompositionEnd = () => {
    state.phase = 'idle';
    syncAtomFromDom();
  };

  $el.on('compositionstart', onCompositionStart);
  $el.on('compositionend', onCompositionEnd);

  // Focus tracking for smart formatting
  const onFocus = () => {
    state.hasFocus = true;
  };

  const onBlur = () => {
    state.hasFocus = false;
    // Force formatting on blur to ensure clean display
    const formatted = format(atom.value);
    if ($el.val() !== formatted) {
      $el.val(formatted);
    }
  };

  $el.on('focus', onFocus);
  $el.on('blur', onBlur);

  // Core sync: DOM → Atom
  const syncAtomFromDom = () => {
    if (state.phase !== 'idle') return;

    state.phase = 'syncing-to-atom';
    batch(() => {
      atom.value = parse($el.val() as string);
    });
    state.phase = 'idle';
  };

  // Input handler with optional debounce
  const onInput = () => {
    if (state.phase !== 'idle') return;

    if (debounceMs) {
      if (state.timeoutId) clearTimeout(state.timeoutId);
      state.timeoutId = window.setTimeout(syncAtomFromDom, debounceMs);
    } else {
      syncAtomFromDom();
    }
  };

  $el.on(event, onInput);
  $el.on('change', onInput);

  // Cleanup handler
  const cleanup = () => {
    $el.off(event, onInput);
    $el.off('change', onInput);
    $el.off('compositionstart', onCompositionStart);
    $el.off('compositionend', onCompositionEnd);
    $el.off('focus', onFocus);
    $el.off('blur', onBlur);
    if (state.timeoutId) clearTimeout(state.timeoutId);
  };

  // Core sync: Atom → DOM (Effect body)
  const effect = () => {
    const formatted = format(atom.value);
    const currentVal = $el.val() as string;

    // Update only if value differs
    if (currentVal !== formatted) {
      // Don't interrupt user input if parsed value matches
      if (state.hasFocus && parse(currentVal) === atom.value) {
        return;
      }

      state.phase = 'syncing-to-dom';
      $el.val(formatted);
      debug.domUpdated($el, 'val', formatted);
      state.phase = 'idle';
    }
  };

  return { effect, cleanup };
}
