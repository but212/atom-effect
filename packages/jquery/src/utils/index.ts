import type { ReadonlyAtom } from '@but212/atom-effect';
import { isAtom } from '@but212/atom-effect';
import type { RenderRoute, RouteDefinition, TemplateRoute } from '@/types';

// ============================================================================
// Reactive helpers
// ============================================================================

/** Checks if a given value is a reactive node (Atom or Computed). */
export const isReactive = (v: unknown): v is ReadonlyAtom<unknown> => isAtom(v);

/** Checks if value is a Promise. */
export const isPromise = <T>(v: unknown): v is Promise<T> =>
  v !== null && typeof v === 'object' && typeof (v as Record<string, unknown>).then === 'function';

/** Generates a human-readable selector string for debug. */
export function getSelector(el: Element): string {
  const tag = el.localName;
  const id = el.id;
  if (id) return `${tag}#${id}`;
  const className = el.className;
  if (typeof className === 'string') {
    const trimmed = className.trim();
    if (trimmed) {
      return `${tag}.${trimmed.replace(/\s+/g, '.')}`;
    }
  }
  return tag;
}

export const hasOwn = Object.prototype.hasOwnProperty;

export const isTemplateRoute = (r: RouteDefinition): r is TemplateRoute =>
  'template' in r && typeof r.template === 'string';
export const isRenderRoute = (r: RouteDefinition): r is RenderRoute =>
  'render' in r && typeof r.render === 'function';

/**
 * Shallow equality check for objects.
 * Optimized to avoid Object.keys() array allocations.
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;

  let countA = 0;
  for (const k in objA) {
    if (hasOwn.call(objA, k)) {
      if (!hasOwn.call(objB, k) || objA[k] !== objB[k]) return false;
      countA++;
    }
  }

  let countB = 0;
  for (const k in objB) {
    if (hasOwn.call(objB, k)) countB++;
  }

  return countA === countB;
}
