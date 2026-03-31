import type { Dependency, Subscriber } from '@/types';
// trackDependency removed as it was obsolete and caused polymorphic cache misses

/**
 * Dependency graph edge.
 */
export class DependencyLink {
  constructor(
    public node: Dependency,
    public version: number,
    // Always initialize to maintain consistent V8 hidden class
    public unsub: (() => void) | undefined = undefined
  ) {}
}

/**
 * Subscription entry.
 */
export class Subscription<T> {
  constructor(
    // Always initialize both properties to maintain consistent V8 hidden class
    public fn: ((newValue?: T, oldValue?: T) => void) | undefined,
    public sub: Subscriber | undefined
  ) {}

  notify(newValue?: T, oldValue?: T): void {
    const fn = this.fn;
    if (fn !== undefined) {
      fn(newValue, oldValue);
      return;
    }

    const sub = this.sub;
    if (sub !== undefined) {
      sub.execute();
    }
  }
}
