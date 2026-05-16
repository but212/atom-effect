/**
 * @module AEJWebComponentUtilities
 *
 * Responsibility:
 * Provides resolution helpers for Shadow DOM access and reactive value
 * extraction specifically for Custom Element controllers.
 *
 * Design Intent:
 * Provides stateless, side-effect-free helper functions that normalize
 * differences between various DOM structures (Shadow DOM vs Light DOM)
 * and input types (Atoms vs Getters).
 */

import { isAtom } from '@but212/atom-effect';
import type { ReactiveValue } from '@/types';

/**
 * Logic: Shadow DOM Discovery
 * Resolves the active ShadowRoot for component-local operations,
 * prioritizing explicit roots over host-attached roots.
 * @internal
 */
export const resolveShadowRoot = (
  element: HTMLElement,
  root: Node | ShadowRoot | null | undefined
): ShadowRoot | null =>
  root instanceof ShadowRoot
    ? root
    : element.shadowRoot instanceof ShadowRoot
      ? element.shadowRoot
      : null;

/**
 * Logic: Polymorphic Resolution
 * Resolves a reactive source into its current value. Supports static values,
 * atoms (via `.value`), and getter functions (via execution).
 * @internal
 */
export const resolveValue = <T>(source: ReactiveValue<T>): T => {
  if (isAtom(source)) return source.value;
  if (typeof source === 'function') return (source as () => T)();
  return source as T;
};
