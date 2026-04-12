/**
 * @fileoverview ReactiveNode (Base) Behavioral Tests
 * @description Verifies core logic including O(1) dirty checking, subscriber management, and re-entry safety.
 */

import { describe, expect, it, vi } from 'vitest';
import { COMPUTED_STATE_FLAGS } from '@/constants';
import { ReactiveNode } from '@/core/base';
import { DepSlotBuffer } from '@/core/buffers';
import { DependencyLink } from '@/core/tracking';
import type { Subscriber } from '@/types';

class TestNode<T = unknown> extends ReactiveNode<T> {
  public dirtyCheckCount = 0;
  public dirtyCheckResult = false;

  get value(): T {
    return undefined as unknown as T;
  }
  peek(): T {
    return this.value;
  }

  // Minimal exposure for testing core logic
  public checkIsDirty() {
    return this._isDirty();
  }
  public setTestDeps(deps: DepSlotBuffer, hotIndex = -1) {
    this._deps = deps;
    this._hotIndex = hotIndex;
  }
  public triggerNotify(nv?: T, ov?: T) {
    this._notifySubscribers(nv, ov);
  }

  protected _deepDirtyCheck(): boolean {
    this.dirtyCheckCount++;
    return this.dirtyCheckResult;
  }
}

describe('ReactiveNode (Base)', () => {
  it('should maintain consistent internal state and flags', () => {
    const node = new TestNode();

    // Check initial state
    expect(node.version).toBe(0);
    expect(node.subscriberCount()).toBe(0);
    expect(node.isDisposed).toBe(false);

    // Verify flag transitions (bitwise logic)
    node.flags |= COMPUTED_STATE_FLAGS.DISPOSED;
    expect(node.isDisposed).toBe(true);

    node.flags |= COMPUTED_STATE_FLAGS.IS_COMPUTED;
    expect(node.isComputed).toBe(true);
  });

  describe('Contract: Subscriber Management', () => {
    it('should ignore duplicate subscriptions (Function & Object)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const node = new TestNode<number>();
      const listener = vi.fn();
      const subObj: Subscriber = { execute: vi.fn() };

      node.subscribe(listener as (newValue?: number, oldValue?: number) => void);
      node.subscribe(listener); // Duplicate
      node.subscribe(subObj);
      node.subscribe(subObj); // Duplicate

      expect(node.subscriberCount()).toBe(2);
      expect(warnSpy).toHaveBeenCalledTimes(2);
      warnSpy.mockRestore();
    });

    it('should survive individual subscriber failures without stopping the chain', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const node = new TestNode<number>();
      const successListener = vi.fn();

      node.subscribe(() => {
        throw new Error('Fail');
      });
      node.subscribe(successListener as (newValue?: number, oldValue?: number) => void);

      node.triggerNotify(1, 0);

      expect(successListener).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('should defer buffer compaction during notification (Re-entry safety)', () => {
      const node = new TestNode<number>();
      let unsub: (() => void) | undefined;

      // Unsubscribe during notification loop
      unsub = node.subscribe(() => unsub?.());
      node.subscribe(vi.fn() as (newValue?: number, oldValue?: number) => void);

      expect(node.subscriberCount()).toBe(2);
      node.triggerNotify(1, 0);

      // Compaction should only happen after the loop ends
      expect(node.subscriberCount()).toBe(1);
    });
  });

  describe('Contract: Dirty Checking Logic', () => {
    it('should use Phase 1 (O(1)) when hot-path dependency version mismatch', () => {
      const node = new TestNode();
      const dep = new TestNode();
      dep.version = 5;

      const deps = new DepSlotBuffer();
      deps.add(new DependencyLink(dep, 4)); // 4 != 5 -> Dirty
      node.setTestDeps(deps, 0);

      expect(node.checkIsDirty()).toBe(true);
      expect(node.dirtyCheckCount).toBe(0); // Deep check skipped
    });

    it('should fallback to Phase 2 (O(N)) if hot-path is clean', () => {
      const node = new TestNode();
      const dep = new TestNode();
      dep.version = 5;

      const deps = new DepSlotBuffer();
      deps.add(new DependencyLink(dep, 5)); // Match -> Clean
      node.setTestDeps(deps, 0);

      node.dirtyCheckResult = true;
      expect(node.checkIsDirty()).toBe(true);
      expect(node.dirtyCheckCount).toBe(1); // Deep check executed
    });
  });
});
