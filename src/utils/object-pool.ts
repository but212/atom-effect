import { POOL_CONFIG } from '@/constants';
import type { Poolable } from '@/types';

/**
 * Object pool to reduce GC pressure by reusing objects.
 * @template T - Type implementing Poolable interface
 */
class ObjectPool<T extends Poolable> {
  private pool: T[] = [];
  private poolSize = 0;
  private readonly maxPoolSize: number;
  private readonly factory: () => T;

  constructor(factory: () => T, maxPoolSize: number = POOL_CONFIG.MAX_SIZE) {
    this.factory = factory;
    this.maxPoolSize = maxPoolSize;
  }

  /** Pre-allocates objects for performance-critical paths */
  warmup(count: number): void {
    const targetSize = Math.min(count, this.maxPoolSize);
    for (let i = this.poolSize; i < targetSize; i++) {
      this.pool[this.poolSize++] = this.factory();
    }
  }

  /** Acquires from pool or creates new */
  acquire(): T {
    if (this.poolSize > 0) {
      return this.pool[--this.poolSize]!;
    }
    return this.factory();
  }

  /** Returns object to pool (calls reset) */
  release(obj: T): void {
    if (this.poolSize < this.maxPoolSize) {
      obj.reset();
      this.pool[this.poolSize++] = obj;
    }
  }

  clear(): void {
    this.pool.length = 0;
    this.poolSize = 0;
  }
}

/** Poolable notification for subscriber callbacks */
class Notification<T = unknown> implements Poolable {
  listener: Function | null = null;
  newValue: T | undefined = undefined;
  oldValue: T | undefined = undefined;

  constructor(listener?: Function, newValue?: T, oldValue?: T) {
    this.listener = listener || null;
    this.newValue = newValue;
    this.oldValue = oldValue;
  }

  execute(): void {
    if (this.listener) {
      this.listener(this.newValue, this.oldValue);
    }
  }

  reset(): void {
    this.listener = null;
    this.newValue = undefined;
    this.oldValue = undefined;
  }
}

/** Poolable scheduler callback */
class SchedulerCallback implements Poolable {
  callback: (() => void) | null = null;

  constructor(callback?: () => void) {
    this.callback = callback || null;
  }

  execute(): void {
    if (this.callback) {
      this.callback();
    }
  }

  reset(): void {
    this.callback = null;
  }
}

export const notificationPool = new ObjectPool(() => new Notification(), POOL_CONFIG.MAX_SIZE);

export const schedulerCallbackPool = new ObjectPool(
  () => new SchedulerCallback(),
  POOL_CONFIG.MAX_SIZE
);

export { Notification, ObjectPool, SchedulerCallback };
export type { Poolable };
