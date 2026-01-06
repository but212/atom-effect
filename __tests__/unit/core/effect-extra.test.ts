import { describe, expect, it, vi } from 'vitest';
import { effect } from '../../../src/core/effect/effect';
import { atom } from '../../../src/core/atom';
import { debug } from '../../../src/utils/debug';

describe('Effect - Extra Coverage', () => {
  it('covers trackModifications and loop warnings', () => {
    const wasEnabled = debug.enabled;
    debug.enabled = true;
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const a = atom(0, { sync: true });
    // When trackModifications is true, and we change an atom while executing
    effect(() => {
      a.value; // Read
      a.value = a.value + 1; // Write
    }, { trackModifications: true });

    expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('Infinite loop may occur'));

    consoleWarn.mockRestore();
    debug.enabled = wasEnabled;
  });

  it('covers infinite loop detection and throw in debug mode', () => {
    const wasEnabled = debug.enabled;
    debug.enabled = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const fx = effect(() => {}, { maxExecutionsPerSecond: 1 });
    
    expect(() => {
      fx.run();
    }).toThrow(/infinite loop suspected/i);

    consoleError.mockRestore();
    debug.enabled = wasEnabled;
  });

  it('covers history buffer break in _recordExecution', async () => {
    const a = atom(0);
    const fx = effect(() => { a.value; }, { maxExecutionsPerSecond: 10 });
    
    // Fill history with one item
    a.value = 1;
    
    // Wait > 1s
    await new Promise(res => setTimeout(res, 1100));
    
    // trigger another execution
    a.value = 2;
    // The history loop should now encounter an old timestamp and break
  });

  it('covers partial dependency commitment on error', () => {
    const a = atom(0);
    const b = atom(0);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const fx = effect(() => {
      a.value;
      throw new Error('fail middle');
      b.value;
    });

    // Should still be subscribed to 'a' because it was accessed before error
    expect((a as any).subscriberCount()).toBeGreaterThan(0);
    
    consoleError.mockRestore();
  });
});
