import type { ReadonlyAtom } from '@but212/atom-effect';
import { isAtom } from '@but212/atom-effect';
import type { RenderRoute, RouteDefinition, TemplateRoute } from '@/types';

// ============================================================================
// Reactive helpers
// ============================================================================

/**
 * Checks if a given value is a reactive node (Atom or Computed).
 *
 * `isAtom` returns `true` for both plain atoms and computed atoms because
 * `ComputedAtomImpl` carries `ATOM_BRAND` in addition to `COMPUTED_BRAND`.
 * A separate `isComputed` check would therefore be redundant.
 */
/** Checks if value is an Atom or Computed. */
export const isReactive = (v: unknown): v is ReadonlyAtom<unknown> => isAtom(v);

export const isPromise = <T>(v: unknown): v is Promise<T> =>
  !!v && typeof (v as { then?: unknown }).then === 'function';

/** Generates a human-readable selector string for debug. */
export function getSelector(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  const cls = Array.from(el.classList);
  return cls.length ? `${tag}.${cls.join('.')}` : tag;
}

export const hasOwn = Object.prototype.hasOwnProperty;

export const isTemplateRoute = (r: RouteDefinition): r is TemplateRoute =>
  'template' in r && typeof r.template === 'string';
export const isRenderRoute = (r: RouteDefinition): r is RenderRoute =>
  'render' in r && typeof r.render === 'function';

/** Shallow equality check for objects. */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const kA = Object.keys(a),
    kB = Object.keys(b);
  if (kA.length !== kB.length) return false;
  return kA.every(
    (k) =>
      hasOwn.call(b, k) && (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]
  );
}
