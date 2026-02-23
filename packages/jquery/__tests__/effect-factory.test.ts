import { describe, expect, it, vi } from 'vitest';
import { debug } from '../src/debug';
import { registerReactiveEffect } from '../src/effect-factory';
import $ from '../src/index';

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
    const domUpdatedSpy = vi.spyOn(debug, 'domUpdated');

    try {
      debug.enabled = true;
      registerReactiveEffect(el, 'static', updater, 'debug-test');
      expect(domUpdatedSpy).toHaveBeenCalledWith(expect.anything(), el, 'debug-test', 'static');
    } finally {
      debug.enabled = false;
    }
  });
});
