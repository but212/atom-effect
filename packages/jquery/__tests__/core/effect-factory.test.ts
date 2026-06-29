import { describe, expect, it, vi } from 'vitest';
import { registerMapEffect, registerReactiveEffect } from '@/core/effect-factory';
import $ from '@/index';

describe('Effect Factory', () => {
  /**
   * 1. Basic Synchronization & Reactive Path
   */
  it('Consistency: handles immediate sync and reactive updates for both single and map effects', async () => {
    const element = document.createElement('div');
    const atomValue = $.atom('initial');
    const atomMap = $.atom(10);

    // Single source via public API
    $(element).atomText(atomValue);
    expect(element.textContent).toBe('initial');
    atomValue.value = 'updated';
    await $.nextTick();
    expect(element.textContent).toBe('updated');

    // Map source via public API
    $(element).atomBind({
      text: $.computed(() => `Count: ${atomMap.value}, Static: value`),
    });
    expect(element.textContent).toBe('Count: 10, Static: value');
    atomMap.value = 20;
    await $.nextTick();
    expect(element.textContent).toBe('Count: 20, Static: value');
  });

  /**
   * 2. Asynchronous Operations
   */
  describe('Asynchronous Operations', () => {
    it('verifies Promise resolution and prevents stale instance updates', async () => {
      const element = document.createElement('div');
      const p1 = Promise.resolve('old');
      const atom = $.atom<Promise<string> | string>(p1);

      $(element).atomText(atom);

      // Initial resolution
      await vi.waitFor(() => expect(element.textContent).toBe('old'));

      // New Promise instance
      const p2 = Promise.resolve('new');
      atom.value = p2;
      await vi.waitFor(() => expect(element.textContent).toBe('new'));
    });

    it('handles map effects with Promise values', async () => {
      const element = document.createElement('div');
      const p1 = Promise.resolve('async-value');
      const value = $.atom('sync-value');
      const updater = vi.fn();

      registerMapEffect(element, { p: p1, s: value }, updater, 'test');

      await vi.waitFor(() => {
        expect(updater).toHaveBeenCalledWith({ p: 'async-value', s: 'sync-value' });
      });
    });

    it('Race Conditions: discards values from outdated promises when a newer update starts', async () => {
      const element = document.createElement('div');
      let resolve1: (value: string) => void = () => {};
      let resolve2: (value: string) => void = () => {};

      const p1 = new Promise<string>((r) => {
        resolve1 = r;
      });
      const p2 = new Promise<string>((r) => {
        resolve2 = r;
      });

      const atom = $.atom<Promise<string> | string>(p1);
      $(element).atomText(atom);

      // Trigger newer p2 update
      atom.value = p2;
      await $.nextTick();

      // Newer resolves first
      resolve2('newest-value');
      await vi.waitFor(() => expect(element.textContent).toBe('newest-value'));

      // Older resolves later
      resolve1('stale-value');
      await $.nextTick();

      // Outdated value must be discarded, newest-value preserved
      expect(element.textContent).toBe('newest-value');
    });
  });

  /**
   * 3. Lifecycle Safety & Diagnostics
   */
  describe('Diagnostics & Lifecycle Safety', () => {
    it('Memory Safety: prevents zombie updates for both reactive and static async sources', async () => {
      const element = document.createElement('div');
      document.body.appendChild(element);

      // Case A: Reactive Source
      const atom = $.atom('initial');
      $(element).atomText(atom);

      document.body.removeChild(element); // Immediate disconnect
      await $.nextTick();

      atom.value = 'discarded';
      await $.nextTick();
      expect(element.textContent).not.toBe('discarded');

      // Case B: Static Promise Source
      const { promise, resolve } = (() => {
        let resolveCallback: (value: string) => void = () => {};
        const promiseInstance = new Promise<string>((resolve) => {
          resolveCallback = resolve;
        });
        return { promise: promiseInstance, resolve: resolveCallback };
      })();

      const el2 = document.createElement('div');
      document.body.appendChild(el2);
      $(el2).atomText(promise);
      document.body.removeChild(el2); // Disconnect before resolution

      resolve('resolved');
      await $.nextTick();
      expect(el2.textContent).not.toBe('resolved');
    });

    it('Error Handling: reports promise rejections to the debug module', async () => {
      const error = new Error('async-fail');
      const rej = Promise.reject(error);
      const errorSpy = vi.spyOn($.debug, 'error').mockImplementation(() => {});

      $(document.createElement('div')).atomText(rej);

      await $.nextTick();
      expect(errorSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), error);
      errorSpy.mockRestore();
    });

    it('handles updater error gracefully by logging error', () => {
      const errorSpy = vi.spyOn($.debug, 'error').mockImplementation(() => {});
      $.debug.enabled = true;
      const element = document.createElement('div');
      registerReactiveEffect(
        element,
        'test',
        () => {
          throw new Error('sync-fail');
        },
        'text'
      );
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('handles falsy static values correctly in batched effects', async () => {
      const registry = await import('@/core/registry');
      const element = document.createElement('div');
      const el2 = document.createElement('div');

      try {
        $(element).atomBind({
          show: false,
        });
        expect(element.style.display).toBe('none');

        $(el2).atomBind({
          class: {
            active: false,
          },
        });
        expect($(el2).hasClass('active')).toBe(false);
      } finally {
        registry.registry.cleanup(element);
        registry.registry.cleanup(el2);
      }
    });
  });
});
