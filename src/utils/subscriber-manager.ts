/**
 * @fileoverview Subscriber management utility
 * @description Manages subscribers with O(1) add/remove operations using Array + WeakMap
 */

/**
 * Manages subscribers with optimized O(1) operations
 *
 * Uses a combination of Array (for iteration) and WeakMap (for O(1) lookup)
 * to provide both fast iteration and fast add/remove operations.
 *
 * Key optimizations:
 * - Array for cache-friendly sequential iteration
 * - WeakMap for O(1) lookup and automatic GC
 * - Swap-and-pop for O(1) removal
 * - Lazy initialization to save memory
 *
 * @template T - Subscriber type (any object type for WeakMap compatibility)
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
export class SubscriberManager<T extends object> {
  private subscribers: T[] | null = null;
  private subscriberIndex: WeakMap<T, number> | null = null;

  /**
   * Adds a subscriber and returns an unsubscribe function
   *
   * Performs lazy initialization on first subscriber.
   * Duplicate subscribers are ignored (idempotent).
   *
   * @param subscriber - Function to add as subscriber
   * @returns Unsubscribe function (O(1) removal)
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
      this.subscriberIndex = new WeakMap();
    }

    // Check for duplicates (O(1))
    if (this.subscriberIndex!.has(subscriber)) {
      // Already subscribed, return no-op unsubscribe
      return () => {};
    }

    // Add subscriber (O(1))
    const index = this.subscribers.length;
    this.subscribers.push(subscriber);
    this.subscriberIndex!.set(subscriber, index);

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
   * Time complexity: O(1)
   * - Swaps target with last element
   * - Pops last element
   * - Updates index mapping
   *
   * @param subscriber - Subscriber to remove
   * @returns True if removed, false if not found
   */
  remove(subscriber: T): boolean {
    if (!this.subscribers || !this.subscriberIndex) {
      return false;
    }

    const idx = this.subscriberIndex.get(subscriber);
    if (idx === undefined) {
      return false; // Not found
    }

    const lastIndex = this.subscribers.length - 1;

    // Swap with last element (O(1))
    if (idx !== lastIndex) {
      const lastSubscriber = this.subscribers[lastIndex]!;
      this.subscribers[idx] = lastSubscriber;
      this.subscriberIndex.set(lastSubscriber, idx);
    }

    // Pop last element (O(1))
    this.subscribers.pop();
    this.subscriberIndex.delete(subscriber);

    return true;
  }

  /**
   * Checks if a subscriber is registered
   *
   * @param subscriber - Subscriber to check
   * @returns True if registered
   */
  has(subscriber: T): boolean {
    return this.subscriberIndex?.has(subscriber) ?? false;
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
    if (this.subscribers) {
      this.subscribers.length = 0;
    }
    this.subscriberIndex = null;
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
