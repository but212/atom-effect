import { debug } from "./debug";
import type { InputBindingState, ValOptions, WritableAtom } from "./types";
import { createInputBindingState } from "./types";

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
  options: ValOptions<T> = {},
): { effect: () => void; cleanup: () => void } {
  const {
    debounce: debounceMs,
    event = "input",
    parse = (v: string) => v as unknown as T,
    format = (v: T) => String(v ?? ""),
    equal = Object.is,
  } = options;

  const state: InputBindingState = createInputBindingState();

  // IME composition support (CJK input)
  const onCompositionStart = () => {
    state.phase = "composing";
  };

  const onCompositionEnd = () => {
    state.phase = "idle";
    syncAtomFromDom();
  };

  $el.on("compositionstart", onCompositionStart);
  $el.on("compositionend", onCompositionEnd);

  // Focus tracking for smart formatting
  const onFocus = () => {
    state.hasFocus = true;
  };

  // Core sync: DOM → Atom (defined early for blur flush)
  const syncAtomFromDom = () => {
    if (state.phase !== "idle") return;

    state.phase = "syncing-to-atom";
    atom.value = parse($el.val() as string);
    state.phase = "idle";
  };

  const onBlur = () => {
    // [Fix] Flush pending debounce before formatting to prevent data loss
    if (state.timeoutId) {
      clearTimeout(state.timeoutId);
      state.timeoutId = null;
      syncAtomFromDom();
    }

    state.hasFocus = false;
    // Force formatting on blur to ensure clean display (now with latest value)
    const formatted = format(atom.value);
    if ($el.val() !== formatted) {
      $el.val(formatted);
    }
  };

  $el.on("focus", onFocus);
  $el.on("blur", onBlur);

  // Input handler with optional debounce
  const onInput = () => {
    if (state.phase !== "idle") return;

    if (debounceMs) {
      if (state.timeoutId) clearTimeout(state.timeoutId);
      state.timeoutId = window.setTimeout(syncAtomFromDom, debounceMs);
    } else {
      syncAtomFromDom();
    }
  };

  $el.on(event, onInput);
  $el.on("change", onInput);

  // Cleanup handler
  const cleanup = () => {
    $el.off(event, onInput);
    $el.off("change", onInput);
    $el.off("compositionstart", onCompositionStart);
    $el.off("compositionend", onCompositionEnd);
    $el.off("focus", onFocus);
    $el.off("blur", onBlur);
    if (state.timeoutId) clearTimeout(state.timeoutId);
  };

  // Core sync: Atom → DOM (Effect body)
  const effect = () => {
    const formatted = format(atom.value);
    const currentVal = $el.val() as string;

    // Update only if value differs
    if (currentVal !== formatted) {
      // Don't interrupt user input if parsed value matches
      if (state.hasFocus && equal(parse(currentVal), atom.value)) {
        return;
      }

      state.phase = "syncing-to-dom";

      // [Fix] Preserve cursor position when focused (external update scenario)
      if (state.hasFocus) {
        const input = $el[0] as HTMLInputElement | HTMLTextAreaElement;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        $el.val(formatted);
        // Clamp cursor position to new value length
        const maxPos = formatted.length;
        input.setSelectionRange(
          Math.min(start ?? maxPos, maxPos),
          Math.min(end ?? maxPos, maxPos),
        );
      } else {
        $el.val(formatted);
      }

      debug.domUpdated($el, "val", formatted);
      state.phase = "idle";
    }
  };

  return { effect, cleanup };
}
