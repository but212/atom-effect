import { describe, expect, it, vi } from 'vitest';
import { registerMapEffect, registerReactiveEffect } from '@/core/effect-factory';
import $ from '@/index';
import { debug } from '@/utils/debug';

describe('Effect Factory', () => {
  it('executes updater immediately for static values', () => {
    const updater = vi.fn();
    registerReactiveEffect(document.createElement('div'), 'static', updater, 'ctx');
    expect(updater).toHaveBeenCalledWith('static');
  });

  it('creates an effect that updates on atom change', async () => {
    const atom = $.atom('initial');
    const updater = vi.fn();

    registerReactiveEffect(document.createElement('div'), atom, updater, 'ctx');
    expect(updater).toHaveBeenCalledWith('initial');

    atom.value = 'updated';
    await Promise.resolve(); // Wait for microtask (effect propagation)
    expect(updater).toHaveBeenCalledWith('updated');
  });

  it('integrates with debug module when enabled', () => {
    const el = document.createElement('div');
    const updater = vi.fn();
    try {
      debug.enabled = true;
      const domUpdatedSpy = vi.spyOn(debug, 'domUpdated');
      registerReactiveEffect(el, 'static', updater, 'debug-test');
      expect(domUpdatedSpy).toHaveBeenCalledWith(expect.anything(), el, 'debug-test', 'static');
    } finally {
      debug.enabled = false;
    }
  });

  it('registerMapEffect: updates only when a reactive dependency in the map changes', async () => {
    const atomA = $.atom(1);
    const atomB = $.atom(2);
    const staticC = 3;
    const updater = vi.fn();

    registerMapEffect(
      document.createElement('div'),
      { a: atomA, b: atomB, c: staticC },
      updater,
      'map-test'
    );

    expect(updater).toHaveBeenCalledWith({ a: 1, b: 2, c: 3 });
    updater.mockClear();

    // Update atomA
    atomA.value = 10;
    await Promise.resolve();
    expect(updater).toHaveBeenCalledWith({ a: 10, b: 2, c: 3 });
    updater.mockClear();

    // Update atomB
    atomB.value = 20;
    await Promise.resolve();
    expect(updater).toHaveBeenCalledWith({ a: 10, b: 20, c: 3 });
  });

  it('registerMapEffect: skips reactive path for purely static maps', () => {
    const updater = vi.fn();
    registerMapEffect(document.createElement('div'), { a: 1, b: 2 }, updater, 'static-map');
    expect(updater).toHaveBeenCalledWith({ a: 1, b: 2 });
  });
});
