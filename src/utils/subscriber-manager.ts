/**
 * @fileoverview Subscriber management utility
 * @description Manages subscribers with cache-friendly array-based operations
 */

/**
 * Manages subscribers with optimized operations
 *
 * Uses a simple array for maximum cache locality.
 * For typical subscriber counts (<100), linear search outperforms
 * hash-based lookups due to cache friendliness.
 *
 * Key optimizations:
 * - Array for cache-friendly sequential iteration
 * - Swap-and-pop for O(1) removal (after linear search)
 * - Lazy initialization to save memory
 *
 * @template T - Subscriber type
 *
 * @example
 * ```ts
 * const manager = new SubscriberManager<(value: number) => void>();
 *
 * // Add subscriber
 * const unsub = manager.add((val) => console.log(val));
 *
 * // Notify all
 * manager.notify(42);
 *
 * // Remove subscriber
 * unsub();
 * ```
 */
export class SubscriberManager<T> {
  private subscribers: T[] | null = null;

  /**
   * Adds a subscriber and returns an unsubscribe function
   *
   * Performs lazy initialization on first subscriber.
   * Duplicate subscribers are ignored (idempotent).
   *
   * @param subscriber - Function to add as subscriber
   * @returns Unsubscribe function
   *
   * @example
   * ```ts
   * const unsub = manager.add((value) => console.log(value));
   * // Later...
   * unsub(); // Remove this subscriber
   * ```
   */
  add(subscriber: T): () => void {
    // Lazy initialization
    if (!this.subscribers) {
      this.subscribers = [];
    }

    // Check for duplicates (linear scan - fast for small arrays due to cache)
    if (this.subscribers.indexOf(subscriber) !== -1) {
      // Already subscribed, return no-op unsubscribe
      return () => {};
    }

    // Add subscriber
    this.subscribers.push(subscriber);

    // Return unsubscribe function with duplicate protection
    let isUnsubscribed = false;
    return () => {
      if (isUnsubscribed) return;
      isUnsubscribed = true;
      this.remove(subscriber);
    };
  }

  /**
   * Removes a subscriber using swap-and-pop optimization
   *
   * Linear search + O(1) swap-and-pop removal.
   * For small arrays, this is faster than hash-based approaches
   * due to cache locality.
   *
   * @param subscriber - Subscriber to remove
   * @returns True if removed, false if not found
   */
  remove(subscriber: T): boolean {
    if (!this.subscribers) {
      return false;
    }

    const idx = this.subscribers.indexOf(subscriber);
    if (idx === -1) {
      return false; // Not found
    }

    const lastIndex = this.subscribers.length - 1;

    // Swap with last element (O(1))
    if (idx !== lastIndex) {
      this.subscribers[idx] = this.subscribers[lastIndex]!;
    }

    // Pop last element (O(1))
    this.subscribers.pop();

    return true;
  }

  /**
   * Checks if a subscriber is registered
   *
   * @param subscriber - Subscriber to check
   * @returns True if registered
   */
  has(subscriber: T): boolean {
    if (!this.subscribers) return false;
    return this.subscribers.indexOf(subscriber) !== -1;
  }

  /**
   * Iterates over all subscribers with a callback
   *
   * Optimized for cache-friendly sequential access.
   * Errors in callbacks are propagated to the caller.
   *
   * @param fn - Callback to execute for each subscriber
   *
   * @example
   * ```ts
   * manager.forEach((subscriber) => {
   *   subscriber(newValue, oldValue);
   * });
   * ```
   */
  forEach(fn: (subscriber: T, index: number) => void): void {
    if (!this.subscribers) return;

    for (let i = 0; i < this.subscribers.length; i++) {
      fn(this.subscribers[i]!, i);
    }
  }

  /**
   * Safely iterates over subscribers with error handling
   *
   * Catches and logs errors from individual callbacks to prevent
   * one failing subscriber from breaking the entire notification chain.
   *
   * @param fn - Callback to execute for each subscriber
   * @param onError - Optional error handler for each callback error
   */
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

  /**
   * Gets the current number of subscribers
   *
   * @returns Number of active subscribers
   */
  get size(): number {
    return this.subscribers?.length ?? 0;
  }

  /**
   * Checks if there are any subscribers
   *
   * @returns True if at least one subscriber exists
   */
  get hasSubscribers(): boolean {
    return this.size > 0;
  }

  /**
   * Clears all subscribers
   *
   * Removes all subscribers and releases memory.
   * Subsequent operations will re-initialize lazily.
   */
  clear(): void {
    this.subscribers = null;
  }

  /**
   * Gets a copy of all subscribers as an array
   *
   * Useful for debugging or manual iteration.
   * Returns empty array if no subscribers.
   *
   * @returns Array of all subscribers
   */
  toArray(): T[] {
    return this.subscribers ? [...this.subscribers] : [];
  }
}
