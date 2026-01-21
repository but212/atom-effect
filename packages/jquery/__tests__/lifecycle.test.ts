import $ from 'jquery';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/index'; // Register plugins
import { atom } from '@but212/atom-effect';
import { enablejQueryOverrides } from '../src/jquery-patch';
import { disableAutoCleanup, enableAutoCleanup, registry } from '../src/registry';

// Polyfill MutationObserver if needed (jsdom usually supports it)
// But we want to ensure we wait for it.
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('jQuery Lifecycle Overrides', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    enablejQueryOverrides();
    enableAutoCleanup(document.body);
  });

  afterEach(() => {
    disableAutoCleanup();
    registry.cleanupTree(document.body);
  });

  it('should clean up bindings on .remove()', () => {
    const $el = $('<div></div>').appendTo(document.body);
    const text = atom('hello');
    $el.atomText(text);

    expect(registry.hasBind($el[0])).toBe(true);

    $el.remove();

    expect(registry.hasBind($el[0])).toBe(false);
  });

  it('should clean up children bindings on .empty()', () => {
    const $parent = $('<div></div>').appendTo(document.body);
    const $child = $('<span></span>').appendTo($parent);
    const text = atom('hello');
    $child.atomText(text);

    expect(registry.hasBind($child[0])).toBe(true);

    $parent.empty();

    expect(registry.hasBind($child[0])).toBe(false);
    expect($parent[0].hasChildNodes()).toBe(false);
  });

  it('should NOT clean up bindings on .detach()', async () => {
    const $el = $('<div></div>').appendTo(document.body);
    const text = atom('hello');
    $el.atomText(text);

    expect(registry.hasBind($el[0])).toBe(true);

    const $detached = $el.detach();

    // Wait for MutationObserver to potentially fire
    await nextTick();

    expect(registry.hasBind($el[0])).toBe(true); // Should still be bound
    expect(document.body.contains($el[0])).toBe(false);

    // Verify reactivity works in memory
    text.value = 'world';
    await nextTick();
    expect($el.text()).toBe('world');

    // Re-attach
    $detached.appendTo(document.body);

    await nextTick(); // Observer sees add

    text.value = 'again';
    await nextTick();
    expect($el.text()).toBe('again');
  });

  it('should eventually clean up detached element if manually removed later', () => {
    const $el = $('<div></div>').appendTo(document.body);
    const text = atom('val');
    $el.atomText(text);

    const $detached = $el.detach();
    expect(registry.hasBind($el[0])).toBe(true);

    // Now remove the detached element (it's not in DOM, but .remove() on it triggers cleanup)
    $detached.remove();

    expect(registry.hasBind($el[0])).toBe(false);
  });

  it('should not leak memory when .remove() is called multiple times', () => {
    const $el = $('<div></div>').appendTo(document.body);
    const text = atom('test');
    $el.atomText(text);

    $el.remove();
    expect(registry.hasBind($el[0])).toBe(false);

    // call remove again
    $el.remove();
    // Should not throw
  });

  it('registry should correctly report hasBind', () => {
    const el = document.createElement('div');
    expect(registry.hasBind(el)).toBe(false);
    registry.trackCleanup(el, () => {});
    expect(registry.hasBind(el)).toBe(true);
    registry.cleanup(el);
    expect(registry.hasBind(el)).toBe(false);
  });

  it('registry should handle errors during dispose and cleanup', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('div');
    $.atom.debug = true;

    // Dispose error
    registry.trackEffect(el, {
      dispose: () => {
        throw new Error('dispose fail');
      },
      run: () => {},
      isDisposed: false,
      executionCount: 0,
    });

    registry.cleanup(el);
    expect(warnSpy).toHaveBeenCalled();

    // Cleanup error
    registry.trackCleanup(el, () => {
      throw new Error('cleanup fail');
    });
    registry.cleanup(el);
    expect(warnSpy).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it('should support .off() with original handler and .on(events, false)', () => {
    const $el = $('<div>');
    const handler = vi.fn();

    $el.on('click', handler);
    $el.trigger('click');
    expect(handler).toHaveBeenCalled();

    $el.off('click', handler);
    $el.trigger('click');
    expect(handler).toHaveBeenCalledTimes(1);

    // .on(events, false) branch coverage
    $el.on('click', false);
    $el.trigger('click');
    // Just ensuring no crash
  });

  it('patch: remove and detach should support selectors', () => {
    const $parent = $('<div>').appendTo(document.body);
    const $child1 = $('<div class="a">').appendTo($parent);
    const $child2 = $('<div class="b">').appendTo($parent);

    registry.trackCleanup($child1[0], () => {});
    registry.trackCleanup($child2[0], () => {});

    // remove with selector
    $parent.children().remove('.a');
    expect(registry.hasBind($child1[0])).toBe(false);
    expect(registry.hasBind($child2[0])).toBe(true);

    // detach with selector
    $parent.children().detach('.b');
    expect(registry.isKept($child2[0])).toBe(true);

    $parent.remove();
  });

  it('patch: off() should handle events without handlers or unregistered handlers', () => {
    const $el = $('<div>');
    // fnIndex === -1 branch
    expect(() => $el.off('click')).not.toThrow();

    // unregistered handler branch
    const unregistered = () => {};
    expect(() => $el.off('click', unregistered)).not.toThrow();
  });

  it('debug environment detection (getInitialDebugState branches)', () => {
    // We can also test the setter/getter logic in debug.ts which we already do in namespace.test.ts
  });

  it('patch: should batch updates inside jQuery events', async () => {
    const count = atom(0);
    let computeCount = 0;

    $.effect(() => {
      const _val = count.value;
      computeCount++;
      return undefined;
    });

    computeCount = 0;
    const $btn = $('<button>').appendTo(document.body);

    $btn.on('click', () => {
      count.value++;
      count.value++;
    });

    $btn.trigger('click');
    await $.nextTick();

    expect(computeCount).toBe(1);
    expect(count.value).toBe(2);
    $btn.remove();
  });

  it('patch: should respect original context (this)', () => {
    const $btn = $('<button>').appendTo(document.body);
    let capturedThis: HTMLElement | null = null;

    $btn.on('click', function (this: HTMLElement) {
      capturedThis = this;
    });

    $btn.trigger('click');
    expect(capturedThis).toBe($btn[0]);
    $btn.remove();
  });

  it('patch: should reuse wrapper for same handler (cache hit)', () => {
    const handler = () => {};
    const $btn = $('<button>');

    $btn.on('click', handler);
    $btn.on('mouseover', handler);

    $btn.off('click', handler);
    $btn.off('mouseover', handler);
  });

  describe('Atom Mount', () => {
    it('should mount and unmount components with cleanup', () => {
      const $el = $('<div>').appendTo(document.body);
      const cleanup = vi.fn();

      const Component = (el: JQuery) => {
        el.text('mounted');
        return cleanup;
      };

      $el.atomMount(Component);
      expect($el.text()).toBe('mounted');

      $el.atomUnmount();
      expect(cleanup).toHaveBeenCalled();

      $el.remove();
    });

    it('should unmount existing component when mounting a new one', () => {
      const $el = $('<div>').appendTo(document.body);
      const cleanup1 = vi.fn();

      $el.atomMount(() => {
        cleanup1();
        return undefined;
      });
      $el.atomMount(() => undefined); // Mount a second one

      expect(cleanup1).toHaveBeenCalled();

      $el.remove();
    });

    it('should handle errors in component function', () => {
      const $el = $('<div>').appendTo(document.body);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      $el.atomMount(() => {
        throw new Error('mount fail');
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[atom-effect-jquery] Mount error:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
      $el.remove();
    });

    it('should handle cleanup functions that throw errors', () => {
      const $el = $('<div>').appendTo(document.body);
      $el.atomMount(() => () => {
        throw new Error('cleanup fail');
      });

      // Should not throw when unmounting
      expect(() => $el.atomUnmount()).not.toThrow();
      $el.remove();
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should cleanup bindings when element is removed (MutationObserver)', async () => {
      const count = atom(0);
      let formatRuns = 0;
      const $el = $('<div></div>').appendTo(document.body);

      $el.atomText(count, (v) => {
        formatRuns++;
        return String(v);
      });

      await nextTick();
      expect(formatRuns).toBe(1);

      $el.remove();
      // Wait for MutationObserver (async)
      await new Promise((r) => setTimeout(r, 50));

      count.value = 999;
      await nextTick();
      expect(formatRuns).toBe(1); // Should not increase
    });
  });
});
