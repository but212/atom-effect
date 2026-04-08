import { describe, expect, it, vi } from 'vitest';
import { COMPUTED_STATE_FLAGS, EPOCH_CONSTANTS } from '@/constants';
import { ReactiveNode } from '@/core/base';
import { hasOwn } from '../../utils/test-helpers';

/**
 * Concrete implementation of ReactiveNode for testing.
 */
class TestNode<T> extends ReactiveNode<T> {
  protected _deepDirtyCheck(): boolean {
    return false;
  }

  // Accessors for internal state verification without exposing them globally
  get internalSlots() {
    return this._slots;
  }

  triggerNotify(newValue?: T, oldValue?: T) {
    this._notifySubscribers(newValue, oldValue);
  }

  setFlag(flag: number) {
    this.flags |= flag;
  }
}

describe('ReactiveNode (Base)', () => {
  describe('Lifecycle: Initialization & State', () => {
    it('initializes with consistent object shape and default values', () => {
      const node = new TestNode();

      // V8 Monomorphism: verify property presence even if undefined
      expect(hasOwn.call(node, '_nextEpoch'), 'V8 Hidden Class consistency').toBe(true);

      // Default State
      expect(node.flags).toBe(0);
      expect(node.version).toBe(0);
      expect(node._lastSeenEpoch).toBe(EPOCH_CONSTANTS.UNINITIALIZED);
      expect(node.id).toBeGreaterThanOrEqual(0);
      expect(node.hasError).toBe(false);
    });

    it('reflects HAS_ERROR flag state correctly', () => {
      const node = new TestNode();
      node.setFlag(COMPUTED_STATE_FLAGS.HAS_ERROR);
      expect(node.hasError).toBe(true);
    });
  });

  describe('Lifecycle: Subscription & Resource Management', () => {
    it('prevents new subscriptions and cleans up memory when disposed', () => {
      const node = new TestNode();

      // 1. Memory Management: Allocation on demand
      const unsub = node.subscribe(() => {});
      expect(node.internalSlots).not.toBeNull();

      // 2. Memory Management: Release when empty
      unsub();
      expect(node.internalSlots, 'Releases SlotBuffer when empty').toBeNull();

      // 3. Lifecycle Guard: subscription after disposal
      node.setFlag(COMPUTED_STATE_FLAGS.DISPOSED);
      node.subscribe(() => {});
      expect(node.subscriberCount()).toBe(0);
    });
  });

  describe('Edge Cases: Notification Robustness', () => {
    it('isolates subscriber errors to prevent notification chain interruption', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const node = new TestNode<number>();

      const badSpy = vi.fn().mockImplementation(() => {
        throw new Error('boom');
      });
      const goodSpy = vi.fn();

      node.subscribe(badSpy);
      node.subscribe(goodSpy);

      node.triggerNotify(1, 0);

      expect(badSpy).toHaveBeenCalledWith(1, 0);
      expect(goodSpy).toHaveBeenCalledWith(1, 0);
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });
});
