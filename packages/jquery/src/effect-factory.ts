import { effect, type ReadonlyAtom, untracked } from '@but212/atom-effect';
import { ERROR_MESSAGES, LOG_PREFIXES } from './constants';
import { debug } from './debug';
import { registry } from './registry';
import type { ReactiveValue } from './types';
import { isReactive } from './utils';

// ============================================================================
// Debug type
// ============================================================================

/**
 * Structured label identifying which binding produced a debug log entry.
 * Fixed bindings use a plain literal; per-key bindings use a `prefix.key` form
 * where the key portion must be non-empty.
 */
export type BindingDebugType =
  | 'text'
  | 'html'
  | 'show'
  | 'hide'
  | 'checked'
  | `class.${string & {}}`
  | `css.${string & {}}`
  | `attr.${string & {}}`
  | `prop.${string & {}}`
  | (string & {});

// ============================================================================
// Core factory
// ============================================================================

/**
 * Registers a reactive effect that calls `updater` whenever `source` changes,
 * or calls `updater` once immediately if `source` is a static value.
 *
 * Responsibilities:
 * - Reactive path: wraps `updater` in an `effect`, tracks it on the registry.
 * - Static path: applies the value once; no effect is registered.
 * - Debug path: logs both the static initial bind and reactive updates via
 *   `debug.domUpdated` so that all DOM writes appear in a uniform format.
 * - Error path: catches `updater` exceptions and surfaces them via `console.error`
 *   so that a broken binding does not silently kill the effect loop.
 *   Both the reactive and static paths are guarded consistently.
 *
 * @param el        DOM element to associate the effect with.
 * @param source    Reactive or static value source.
 * @param updater   Function that writes the value to the DOM.
 * @param debugType Structured label used in debug log output.
 */
export function registerReactiveEffect<T>(
  el: HTMLElement,
  source: ReactiveValue<T>,
  updater: (value: T) => void,
  debugType: BindingDebugType
): void {
  if (isReactive(source)) {
    const reactiveSource = source as ReadonlyAtom<T>;
    registry.trackEffect(
      el,
      effect(() => {
        // Read the source value inside the tracking context — this is the
        // ONLY dependency this effect should subscribe to.
        const value = reactiveSource.value;

        // Run the updater untracked so that any atom reads inside updater
        // (user formatters, guards, computed lookups) cannot accidentally
        // add extra subscriptions to this effect.
        untracked(() => {
          try {
            updater(value);
          } catch (e) {
            debug.error(LOG_PREFIXES.BINDING, `${ERROR_MESSAGES.UPDATER_ERROR(debugType)}:`, e);
            return;
          }
          // debug.domUpdated already guards on debug.enabled internally, but
          // skipping the call entirely avoids a function-call overhead on every
          // atom update in production (debug disabled).
          if (debug.enabled) debug.domUpdated(el, debugType, value);
        });
      })
    );
  } else {
    // Static value: apply once with the same error surface as the reactive path.
    try {
      updater(source);
    } catch (e) {
      debug.error(LOG_PREFIXES.BINDING, `${ERROR_MESSAGES.UPDATER_ERROR(debugType)} (static):`, e);
      return;
    }
    if (debug.enabled) debug.domUpdated(el, debugType, source);
  }
}
