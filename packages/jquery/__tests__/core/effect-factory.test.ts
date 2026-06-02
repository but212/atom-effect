import { describe, expect, it, vi } from 'vitest';
import $ from '@/index';

describe('Effect Factory', () => {
  /**
   * 1. Basic Synchronization & Reactive Path
   * Verifies immediate update on registration and subsequent reactive propagation.
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
   * 2. Asynchronous Handling
   * Verifies Promise resolution and stale instance updates.
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

    it('Error Handling: reports promise rejections to the debug module', async () => {
      const error = new Error('async-fail');
      const rej = Promise.reject(error);
      const errorSpy = vi.spyOn($.debug, 'error').mockImplementation(() => {});

      $(document.createElement('div')).atomText(rej);

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
});
