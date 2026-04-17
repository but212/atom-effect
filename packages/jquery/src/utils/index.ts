import type { RenderRoute, RouteDefinition, TemplateRoute } from '@/types';

export const isPromise = <T>(v: unknown): v is Promise<T> =>
  v !== null &&
  (typeof v === 'object' || typeof v === 'function') &&
  typeof (v as PromiseLike<T>).then === 'function';

export function getSelector(el: Element): string {
  const { localName: tag, id, className } = el;
  let res = tag;
  if (id) res += `#${id}`;

  const classStr =
    typeof className === 'string'
      ? className
      : (className as unknown as SVGAnimatedString)?.baseVal;

  if (classStr) {
    const trimmed = classStr.trim().replace(/\s+/g, '.');
    if (trimmed) res += `.${trimmed}`;
  }

  const type = (el as { type?: string }).type;
  if (type && type !== 'text') res += `.${type}`;

  return res;
}

export const hasOwn = Object.prototype.hasOwnProperty;

export const isTemplateRoute = (r: RouteDefinition): r is TemplateRoute =>
  r !== null && typeof r === 'object' && 'template' in r;

export const isRenderRoute = (r: RouteDefinition): r is RenderRoute =>
  r !== null && typeof r === 'object' && 'render' in r;

export function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  if (keysA.length !== Object.keys(objB).length) return false;

  for (const key of keysA) {
    if (!hasOwn.call(objB, key) || !Object.is(objA[key], objB[key])) return false;
  }
  return true;
}
