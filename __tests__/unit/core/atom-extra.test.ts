import { describe, expect, it, vi } from 'vitest';
import { atom } from '../../../src/core/atom/atom';
import { trackingContext } from '../../../src/tracking';

describe('Atom - Extra Coverage', () => {
  it('covers manual function tracker path in _track', () => {
    const a = atom(0);
    const listener = vi.fn();
    
    // trackingContext.run sets the current collector.
    // When a.value is called, it calls _track(listener).
    // listener is a plain function, so it should be added to _functionSubscribers.
    trackingContext.run(listener, () => {
      a.value;
    });

    a.value = 1;
    // Batching might be enabled, so we wait or flush.
    // Atom handles notification via scheduler.
    // But since it's a unit test, we can just wait.
  });

  it('covers manual object tracker path in _track (without addDependency)', () => {
    const a = atom(0);
    const execute = vi.fn();
    const tracker = { execute };
    
    trackingContext.run(tracker as any, () => {
      a.value;
    });

    a.value = 1;
  });

  it('covers subscriber error logging for object subscribers', async () => {
    const a = atom(0);
    const tracker = {
      execute: () => {
        throw new Error('Object subscriber fail');
      }
    };
    
    trackingContext.run(tracker as any, () => {
      a.value;
    });

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    a.value = 1;
    // Wait for async notification
    await new Promise(res => setTimeout(res, 0));
    
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
