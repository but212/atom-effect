import { describe, expect, it, vi } from 'vitest';
import { registerMapEffect, registerReactiveEffect } from '@/core/effect-factory';
import $ from '@/index';
import { debug } from '@/utils/debug';

describe('Effect Factory', () => {
  /**
   * 1. Basic Synchronization & Reactive Path
   * Verifies immediate update on registration and subsequent reactive propagation.
   */
  it('Consistency: handles immediate sync and reactive updates for both single and map effects', async () => {
    const el = document.createElement('div');
    const updater = vi.fn();
    const atomValue = $.atom('initial');
    const atomMap = $.atom(10);

    // Single source
    registerReactiveEffect(el, atomValue, updater, 'text-reactive');
    expect(updater).toHaveBeenCalledWith('initial');
    atomValue.value = 'updated';
    await $.nextTick();
    expect(updater).toHaveBeenCalledWith('updated');

    // Map source
    updater.mockClear();
    registerMapEffect<string | number>(
      el,
      { count: atomMap, static: 'val' },
      updater,
      'map-reactive'
    );
    expect(updater).toHaveBeenCalledWith({ count: 10, static: 'val' });
    atomMap.value = 20;
    await $.nextTick();
    expect(updater).toHaveBeenCalledWith({ count: 20, static: 'val' });
  });

  /**
   * 2. Asynchronous Handling
   * Verifies Promise resolution and stale instance updates.
   */
  describe('Asynchronous Operations', () => {
    it('verifies Promise resolution and prevents stale instance updates', async () => {
      const el = document.createElement('div');
      const updater = vi.fn();
      const p1 = Promise.resolve('old');
      const atom = $.atom<Promise<string> | string>(p1);

      registerMapEffect(el, { p: atom }, updater, 'async-test');

      // Initial resolution
      await vi.waitFor(() => expect(updater).toHaveBeenCalledWith({ p: 'old' }));
      updater.mockClear();

      // New Promise instance
      const p2 = Promise.resolve('new');
      atom.value = p2;
      await $.nextTick();
      await vi.waitFor(() => expect(updater).toHaveBeenCalledWith({ p: 'new' }));
    });

    it('Error Handling: reports promise rejections to the debug module', async () => {
      const error = new Error('async-fail');
      const rej = Promise.reject(error);
      const errorSpy = vi.spyOn(debug, 'error').mockImplementation(() => {});

      registerReactiveEffect(document.createElement('div'), rej, vi.fn(), 'err-test');

      await $.nextTick();
      expect(errorSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), error);
      errorSpy.mockRestore();
    });
  });

  /**
   * 3. Lifecycle Safety (Zombie Prevention)
   * Verifies that updates are discarded if the element is disconnected,
   * covering both reactive sources and static asynchronous promises.
   */
  it('Memory Safety: prevents zombie updates for both reactive and static async sources', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const updater = vi.fn();

    // Case A: Reactive Source
    const atom = $.atom('initial');
    registerReactiveEffect(el, atom, updater, 'reactive-zombie');
    atom.value = 'discarded';
    document.body.removeChild(el); // Immediate disconnect
    await $.nextTick();
    expect(updater).not.toHaveBeenCalledWith('discarded');

    // Case B: Static Promise Source
    const { promise, resolve } = (() => {
      let r: (v: string) => void;
      const p = new Promise<string>((res) => {
        r = res;
      });
      return { promise: p, resolve: r! };
    })();

    document.body.appendChild(el);
    updater.mockClear();
    registerReactiveEffect(el, promise, updater, 'static-zombie');
    document.body.removeChild(el); // Disconnect before resolution

    resolve('resolved');
    await $.nextTick();
    expect(updater).not.toHaveBeenCalled();
  });
});
