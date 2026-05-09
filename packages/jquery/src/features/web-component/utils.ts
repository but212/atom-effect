import { isAtom } from '@but212/atom-effect';
import type { ReactiveValue } from '@/types';

/**
 * Resolves the active ShadowRoot for component-local operations.
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
 * Resolves a reactive source into its current value.
 * Supports static values, atoms, and getter functions.
 * @internal
 */
export const resolveValue = <T>(source: ReactiveValue<T>): T => {
  if (isAtom(source)) return source.value;
  if (typeof source === 'function') return (source as () => T)();
  return source as T;
};
