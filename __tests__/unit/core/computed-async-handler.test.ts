import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AsyncComputationHandler,
  PromiseIdManager,
} from '../../../src/core/computed/computed-async-handler';
import { ComputedStateFlags } from '../../../src/core/computed/computed-state-flags';

describe('computed-async-handler', () => {
  describe('PromiseIdManager', () => {
    let manager: PromiseIdManager;

    beforeEach(() => {
      manager = new PromiseIdManager();
    });

    it('should generate monotonic IDs', () => {
      const id1 = manager.next();
      const id2 = manager.next();
      expect(id2).toBe(id1 + 1);
    });

    it('should validate current ID', () => {
      const id = manager.next();
      expect(manager.isValid(id)).toBe(true);
      expect(manager.current()).toBe(id);
    });

    it('should invalidate old IDs', () => {
      const id1 = manager.next();
      manager.next(); // generate id2
      expect(manager.isValid(id1)).toBe(false);
    });

    it('should invalidate manually', () => {
      const id = manager.next();
      manager.invalidate();
      expect(manager.isValid(id)).toBe(false);
    });
  });

  describe('AsyncComputationHandler', () => {
    let flags: ComputedStateFlags;
    let promiseManager: PromiseIdManager;
    let notify: any;
    let handler: AsyncComputationHandler<number>;

    beforeEach(() => {
      flags = new ComputedStateFlags();
      promiseManager = new PromiseIdManager();
      notify = vi.fn();
      handler = new AsyncComputationHandler<number>(flags, promiseManager, Object.is, null, notify);
    });

    it('should handle successful resolution', async () => {
      let val = 0;
      const getValue = () => val;
      const setValue = vi.fn((v) => {
        val = v;
      });
      const setError = vi.fn();

      const promise = Promise.resolve(42);
      handler.handle(promise, getValue, setValue, setError);

      expect(flags.isPending()).toBe(true);

      await promise;
      // Promise handlers are scheduled in microtasks
      await new Promise((res) => setTimeout(res, 0));

      expect(val).toBe(42);
      expect(flags.isResolved()).toBe(true);
      expect(notify).toHaveBeenCalled();
    });

    it('should handle rejection', async () => {
      const setError = vi.fn();
      const promise = Promise.reject(new Error('async fail'));

      handler.handle(
        promise,
        () => 0,
        () => {},
        setError
      );

      try {
        await promise;
      } catch {}
      await new Promise((res) => setTimeout(res, 0));

      expect(flags.isRejected()).toBe(true);
      expect(setError).toHaveBeenCalled();
      expect(notify).toHaveBeenCalled();
    });

    it('should ignore superseded promises', async () => {
      let val = 0;
      const setValue = vi.fn((v) => {
        val = v;
      });

      const p1 = new Promise<number>((res) => setTimeout(() => res(1), 20));
      const p2 = new Promise<number>((res) => setTimeout(() => res(2), 10));

      handler.handle(p1, () => val, setValue, vi.fn());
      handler.handle(p2, () => val, setValue, vi.fn());

      await p1;
      await p2;
      await new Promise((res) => setTimeout(res, 30));

      // Only p2 should have been applied because it was the latest called
      // even if p1 resolves later (or earlier, the ID check handles it)
      expect(val).toBe(2);
      expect(setValue).toHaveBeenCalledTimes(1);
      expect(setValue).toHaveBeenCalledWith(2);
    });
  });
});
