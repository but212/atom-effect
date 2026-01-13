/**
 * Manages subscribers with optimized array-based operations.
 * Uses linear search (cache-friendly for small arrays) + swap-and-pop removal.
 */
export class SubscriberManager<T> {
  private subscribers: T[] | null = null;

  /** Adds subscriber and returns unsubscribe function (idempotent) */
  add(subscriber: T): () => void {
    if (!this.subscribers) {
      this.subscribers = [];
    }

    if (this.subscribers.indexOf(subscriber) !== -1) {
      return () => {};
    }

    this.subscribers.push(subscriber);

    let isUnsubscribed = false;
    return () => {
      if (isUnsubscribed) return;
      isUnsubscribed = true;
      this.remove(subscriber);
    };
  }

  /** Removes subscriber using swap-and-pop */
  remove(subscriber: T): boolean {
    if (!this.subscribers) {
      return false;
    }

    const idx = this.subscribers.indexOf(subscriber);
    if (idx === -1) {
      return false;
    }

    const lastIndex = this.subscribers.length - 1;
    if (idx !== lastIndex) {
      this.subscribers[idx] = this.subscribers[lastIndex]!;
    }
    this.subscribers.pop();

    return true;
  }

  has(subscriber: T): boolean {
    if (!this.subscribers) return false;
    return this.subscribers.indexOf(subscriber) !== -1;
  }

  forEach(fn: (subscriber: T, index: number) => void): void {
    if (!this.subscribers) return;

    for (let i = 0; i < this.subscribers.length; i++) {
      fn(this.subscribers[i]!, i);
    }
  }

  /** Iterates with error handling to prevent one failure from breaking the chain */
  forEachSafe(fn: (subscriber: T, index: number) => void, onError?: (error: Error) => void): void {
    if (!this.subscribers) return;

    for (let i = 0; i < this.subscribers.length; i++) {
      try {
        fn(this.subscribers[i]!, i);
      } catch (error) {
        if (onError) {
          onError(error as Error);
        } else {
          console.error('[SubscriberManager] Error in subscriber callback:', error);
        }
      }
    }
  }

  get size(): number {
    return this.subscribers?.length ?? 0;
  }

  get hasSubscribers(): boolean {
    return this.subscribers !== null && this.subscribers.length > 0;
  }

  clear(): void {
    this.subscribers = null;
  }

  toArray(): T[] {
    return this.subscribers ? [...this.subscribers] : [];
  }
}
