import type { Dependency, Subscriber } from '@/types';
// trackDependency removed as it was obsolete and caused polymorphic cache misses

/**
 * Dependency graph edge.
 */
export class DependencyLink {
  public unsub: (() => void) | undefined;

  constructor(
    public node: Dependency,
    public version: number,
    unsub: (() => void) | undefined = undefined
  ) {
    // Always initialize to maintain consistent V8 hidden class
    this.unsub = unsub;
  }
}

/**
 * Subscription entry.
 */
export class Subscription<T> {
  public fn: ((newValue?: T, oldValue?: T) => void) | undefined;
  public sub: Subscriber | undefined;

  constructor(fn: ((newValue?: T, oldValue?: T) => void) | undefined, sub: Subscriber | undefined) {
    // Always initialize both properties to maintain consistent V8 hidden class
    this.fn = fn;
    this.sub = sub;
  }

  notify(newValue?: T, oldValue?: T): void {
    if (this.fn) this.fn(newValue, oldValue);
    else if (this.sub) this.sub.execute();
  }
}
