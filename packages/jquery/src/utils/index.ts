import type { ReadonlyAtom } from '@but212/atom-effect';
import { isAtom } from '@but212/atom-effect';
import type { RenderRoute, RouteDefinition, TemplateRoute } from '@/types';

// ============================================================================
// Internal Helpers
// ============================================================================

const isObject = (v: unknown): v is object => v !== null && typeof v === 'object';

// ============================================================================
// Reactive helpers
// ============================================================================

/** Checks if a given value is a reactive node (Atom or Computed). */
export const isReactive = (v: unknown): v is ReadonlyAtom<unknown> => isAtom(v);

/**
 * Checks if value is a Promise or Thenable.
 */
export const isPromise = <T>(v: unknown): v is Promise<T> =>
  (isObject(v) || typeof v === 'function') &&
  typeof (v as Record<string, unknown>).then === 'function';

/** Generates a human-readable selector string for debug. */
export function getSelector(el: Element): string {
  const { localName: tag, id, className } = el;
  if (id) return `${tag}#${id}`;

  // Handle SVG className which returns SVGAnimatedString instead of string
  const classStr =
    typeof className === 'string'
      ? className
      : (className as unknown as { baseVal: string }).baseVal;

  if (typeof classStr === 'string') {
    const trimmed = classStr.trim();
    if (trimmed) {
      return `${tag}.${trimmed.replace(/\s+/g, '.')}`;
    }
  }
  return tag;
}

export const hasOwn = Object.prototype.hasOwnProperty;

export const isTemplateRoute = (r: RouteDefinition): r is TemplateRoute =>
  isObject(r) && 'template' in r && typeof r.template === 'string';

export const isRenderRoute = (r: RouteDefinition): r is RenderRoute =>
  isObject(r) && 'render' in r && typeof r.render === 'function';

/**
 * Shallow equality check for objects.
 * Handles NaN correctly using Object.is.
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!isObject(a) || !isObject(b)) return false;

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!hasOwn.call(objB, key) || !Object.is(objA[key], objB[key])) {
      return false;
    }
  }

  return true;
}
