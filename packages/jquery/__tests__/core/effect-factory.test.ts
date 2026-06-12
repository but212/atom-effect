import { describe, expect, it, vi } from 'vitest';
import { registerMapEffect, registerReactiveEffect } from '@/core/effect-factory';
import $ from '@/index';

describe('Effect Factory', () => {
  /**
   * 1. Basic Synchronization & Reactive Path
   */
  it('Consistency: handles immediate sync and reactive updates for both single and map effects', async () => {
    const el = document.createElement('div');
    const atomValue = $.atom('initial');
    const atomMap = $.atom(10);

    // Single source via public API
    $(el).atomText(atomValue);
    expect(el.textContent).toBe('initial');
    atomValue.value = 'updated';
    await $.nextTick();
    expect(el.textContent).toBe('updated');

    // Map source via public API
    $(el).atomBind({
      text: $.computed(() => `Count: ${atomMap.value}, Static: val`),
    });
    expect(el.textContent).toBe('Count: 10, Static: val');
    atomMap.value = 20;
    await $.nextTick();
    expect(el.textContent).toBe('Count: 20, Static: val');
  });

  /**
   * 2. Asynchronous Operations
   */
  describe('Asynchronous Operations', () => {
    it('verifies Promise resolution and prevents stale instance updates', async () => {
      const el = document.createElement('div');
      const p1 = Promise.resolve('old');
      const atom = $.atom<Promise<string> | string>(p1);

      $(el).atomText(atom);

      // Initial resolution
      await vi.waitFor(() => expect(el.textContent).toBe('old'));

      // New Promise instance
      const p2 = Promise.resolve('new');
      atom.value = p2;
      await vi.waitFor(() => expect(el.textContent).toBe('new'));
    });

    it('handles map effects with Promise values', async () => {
      const el = document.createElement('div');
      const p1 = Promise.resolve('async-val');
      const val = $.atom('sync-val');
      const updater = vi.fn();

      registerMapEffect(el, { p: p1, s: val }, updater, 'test');

      await vi.waitFor(() => {
        expect(updater).toHaveBeenCalledWith({ p: 'async-val', s: 'sync-val' });
      });
    });

    it('Race Conditions: discards values from outdated promises when a newer update starts', async () => {
      const el = document.createElement('div');
      let resolve1: (v: string) => void = () => {};
      let resolve2: (v: string) => void = () => {};

      const p1 = new Promise<string>((r) => {
        resolve1 = r;
      });
      const p2 = new Promise<string>((r) => {
        resolve2 = r;
      });

      const atom = $.atom<Promise<string> | string>(p1);
      $(el).atomText(atom);

      // Trigger newer p2 update
      atom.value = p2;
      await $.nextTick();

      // Newer resolves first
      resolve2('newest-val');
      await vi.waitFor(() => expect(el.textContent).toBe('newest-val'));

      // Older resolves later
      resolve1('stale-val');
      await $.nextTick();

      // Outdated value must be discarded, newest-val preserved
      expect(el.textContent).toBe('newest-val');
    });
  });

  /**
   * 3. Lifecycle Safety & Diagnostics
   */
  describe('Diagnostics & Lifecycle Safety', () => {
    it('Memory Safety: prevents zombie updates for both reactive and static async sources', async () => {
      const el = document.createElement('div');
      document.body.appendChild(el);

      // Case A: Reactive Source
      const atom = $.atom('initial');
      $(el).atomText(atom);

      document.body.removeChild(el); // Immediate disconnect
      await $.nextTick();

      atom.value = 'discarded';
      await $.nextTick();
      expect(el.textContent).not.toBe('discarded');

      // Case B: Static Promise Source
      const { promise, resolve } = (() => {
        let r: (v: string) => void = () => {};
        const p = new Promise<string>((res) => {
          r = res;
        });
        return { promise: p, resolve: r };
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
      const el = document.createElement('div');
      registerReactiveEffect(
        el,
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
      const el = document.createElement('div');
      const el2 = document.createElement('div');

      try {
        $(el).atomBind({
          show: false,
        });
        expect(el.style.display).toBe('none');

        $(el2).atomBind({
          class: {
            active: false,
          },
        });
        expect($(el2).hasClass('active')).toBe(false);
      } finally {
        registry.registry.cleanup(el);
        registry.registry.cleanup(el2);
      }
    });
  });
});
