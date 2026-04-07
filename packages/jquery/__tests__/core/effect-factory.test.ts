import { describe, expect, it, vi } from 'vitest';
import { registerMapEffect, registerReactiveEffect } from '@/core/effect-factory';
import $ from '@/index';
import { debug } from '@/utils/debug';

describe('Effect Factory', () => {
  // 1. Basic behavior: Immediate update for non-reactive sources (Static Path)
  it('Initial Sync: executes updater immediately for non-reactive sources', () => {
    const updater = vi.fn();
    const el = document.createElement('div');

    // Single value case
    registerReactiveEffect(el, 'static', updater, 'text-test');
    // Map case
    registerMapEffect(el, { a: 1, b: 2 }, updater, 'map-test');

    expect(updater).toHaveBeenCalledWith('static');
    expect(updater).toHaveBeenCalledWith({ a: 1, b: 2 });
  });

  // 2. Core behavior: Reactive propagation (Reactive Path)
  it('Reactive Propagation: updates DOM when atom dependencies change', async () => {
    const atom = $.atom('initial');
    const updater = vi.fn();
    const el = document.createElement('div');

    // Test registerReactiveEffect
    registerReactiveEffect(el, atom, updater, 'text-reactive');
    expect(updater).toHaveBeenCalledWith('initial');

    atom.value = 'updated';
    await $.nextTick();
    expect(updater).toHaveBeenCalledWith('updated');

    // Test registerMapEffect propagation
    const atomMap = $.atom(10);
    registerMapEffect(el, { val: atomMap }, updater, 'map-reactive');
    expect(updater).toHaveBeenCalledWith({ val: 10 });

    atomMap.value = 20;
    await $.nextTick();
    expect(updater).toHaveBeenCalledWith({ val: 20 });
  });

  // 3. Performance & Async handling (Async Path)
  describe('Asynchronous Handling', () => {
    it('optimization: resolved promises are cached to avoid unnecessary async delays', async () => {
      const staticPromise = Promise.resolve('resolved');
      const atom = $.atom('initial');
      const updater = vi.fn();

      registerMapEffect(
        document.createElement('div'),
        { p: staticPromise, a: atom },
        updater,
        'cache-test'
      );

      // Wait for initial async resolution (needs multiple ticks for Promise.all + inner .then)
      await $.nextTick();
      await $.nextTick();
      await $.nextTick();

      expect(updater).toHaveBeenCalledWith({ p: 'resolved', a: 'initial' });
      updater.mockClear();

      // Subsequent update should be sync (within the same microtask re-run) because promise is cached
      atom.value = 'updated';
      await $.nextTick();
      expect(updater).toHaveBeenCalledWith({ p: 'resolved', a: 'updated' });
    });

    it('error-handling: logs errors to debug module when promises reject', async () => {
      const error = new Error('fail');
      const promise = Promise.resolve().then(() => {
        throw error;
      });
      const errorSpy = vi.spyOn(debug, 'error').mockImplementation(() => {});

      registerMapEffect(document.createElement('div'), { a: promise }, vi.fn(), 'error-test');

      // Wait for rejection propagation
      await $.nextTick();
      await $.nextTick();
      await $.nextTick();
      await $.nextTick();

      expect(errorSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), error);
      errorSpy.mockRestore();
    });
  });

  // 4. Lifecycle safety: Zombie prevention
  it('Safety: prevents zombie updates after element disconnection', async () => {
    const atom = $.atom('initial');
    const updater = vi.fn();
    const el = document.createElement('div');
    document.body.appendChild(el);

    registerReactiveEffect(el, atom, updater, 'zombie-test');
    expect(updater).toHaveBeenCalledWith('initial');
    updater.mockClear();

    // 1. Trigger reactive update
    atom.value = 'updated';
    // 2. Immediately disconnect element (triggers cleanup)
    document.body.removeChild(el);

    await $.nextTick();
    // Updater should NOT be called for disconnected element
    expect(updater).not.toHaveBeenCalled();
  });
});
