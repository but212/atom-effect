import { describe, it, expect, vi } from 'vitest';
import { SyncComputationHandler, ComputationErrorHandler, StateValueHandlers } from '../../../src/core/computed/computed-handlers';
import { ComputedStateFlags } from '../../../src/core/computed/computed-state-flags';
import { ComputedError } from '../../../src/errors/errors';

describe('computed-handlers', () => {
  describe('SyncComputationHandler', () => {
    it('should handle successful computation and notify if value changed', () => {
      const flags = new ComputedStateFlags();
      const notify = vi.fn();
      const handler = new SyncComputationHandler<number>(flags, Object.is, notify);
      
      let val = 0;
      const getValue = () => val;
      const setValue = (v: number) => { val = v; };
      const setError = vi.fn();

      handler.handle(10, getValue, setValue, setError);

      expect(val).toBe(10);
      expect(flags.isResolved()).toBe(true);
      expect(flags.isDirty()).toBe(false);
      expect(setError).toHaveBeenCalledWith(null);
      expect(notify).toHaveBeenCalled();
    });

    it('should not notify if value remains the same', () => {
      const flags = new ComputedStateFlags();
      const notify = vi.fn();
      const handler = new SyncComputationHandler<number>(flags, Object.is, notify);
      
      let val = 10;
      flags.setResolved();
      flags.clearDirty();
      
      const getValue = () => val;
      const setValue = (v: number) => { val = v; };
      const setError = vi.fn();

      handler.handle(10, getValue, setValue, setError);

      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe('ComputationErrorHandler', () => {
    it('should handle error, update flags and throw', () => {
      const flags = new ComputedStateFlags();
      const onError = vi.fn();
      const handler = new ComputationErrorHandler(flags, onError);
      const setError = vi.fn();

      expect(() => handler.handle(new Error('test'), setError)).toThrow(ComputedError);
      
      expect(flags.isRejected()).toBe(true);
      expect(flags.isDirty()).toBe(false);
      expect(setError).toHaveBeenCalled();
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('StateValueHandlers', () => {
    it('should handle recomputing by returning current value', () => {
      const flags = new ComputedStateFlags();
      const handler = new StateValueHandlers<number>(flags, 0, false);
      expect(handler.handleRecomputing(5)).toBe(5);
    });

    it('should handle pending by returning default value if available', () => {
      const flags = new ComputedStateFlags();
      const handler = new StateValueHandlers<number>(flags, 100, true);
      expect(handler.handlePending()).toBe(100);
    });

    it('should throw during pending if no default value', () => {
      const flags = new ComputedStateFlags();
      const handler = new StateValueHandlers<number>(flags, 0, false);
      expect(() => handler.handlePending()).toThrow(ComputedError);
    });

    it('should handle rejected by returning default if recoverable', () => {
      const flags = new ComputedStateFlags();
      const handler = new StateValueHandlers<number>(flags, 100, true);
      const recoverableError = new ComputedError('fail');
      recoverableError.recoverable = true;
      
      expect(handler.handleRejected(recoverableError)).toBe(100);
    });

    it('should throw during rejected if error not recoverable', () => {
      const flags = new ComputedStateFlags();
      const handler = new StateValueHandlers<number>(flags, 100, true);
      const critError = new ComputedError('critical');
      critError.recoverable = false;
      
      expect(() => handler.handleRejected(critError)).toThrow(critError);
    });

    it('should correctly check for default value', () => {
      expect(StateValueHandlers.hasDefault(undefined)).toBe(true);
      expect(StateValueHandlers.hasDefault(null)).toBe(true);
      // NO_DEFAULT_VALUE is a unique object/sentinel in utils/debug.ts
      // but let's just test that it works for normal values
      expect(StateValueHandlers.hasDefault(10)).toBe(true);
    });
  });
});
