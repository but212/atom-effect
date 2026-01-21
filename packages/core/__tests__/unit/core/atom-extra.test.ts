import { describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { trackingContext } from '@/tracking';
import { tick } from '../../utils/test-helpers';

describe('Atom - Extra Coverage', () => {
  it('covers manual function tracker path in _track', async () => {
    const a = atom(0);
    const listener = vi.fn();

    // trackingContext.run sets the current collector.
    // When a.value is called, it calls _track(listener).
    // listener is a plain function, so it should be added to _functionSubscribers.
    trackingContext.run(listener, () => {
      a.value;
    });

    // trackingContext.run just sets context and runs fn, it doesn't call listener.
    expect(listener).toHaveBeenCalledTimes(0);

    a.value = 1;

    // Wait for the asynchronous scheduler to run and trigger the listener.
    await tick();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('covers manual object tracker path in _track (without addDependency)', async () => {
    const a = atom(0);
    const execute = vi.fn();
    const tracker = { execute };

    trackingContext.run(tracker, () => {
      a.value;
    });

    // trackingContext.run just sets context and runs fn, it doesn't call execute.
    expect(execute).toHaveBeenCalledTimes(0);

    a.value = 1;

    // Wait for the asynchronous scheduler to run and trigger the tracker.
    await tick();

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('covers subscriber error logging for object subscribers', async () => {
    const a = atom(0);
    const tracker = {
      execute: () => {
        throw new Error('Object subscriber fail');
      },
    };

    trackingContext.run(tracker, () => {
      a.value;
    });

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    a.value = 1;
    // Wait for async notification
    await tick();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
