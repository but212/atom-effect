import $ from 'jquery';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/index';
import { registry } from '@/core/registry';

describe('Atom Mount (Component Lifecycle)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    registry.cleanupTree(document.body);
  });

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
    $el.atomMount(() => undefined);

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
      expect.stringContaining('[atom-mount] Mount error'),
      expect.any(Error)
    );
    consoleSpy.mockRestore();
    $el.remove();
  });

  it('should log console.error when userCleanup throws', () => {
    const $el = $('<div>').appendTo(document.body);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    $el.atomMount(() => {
      return () => {
        throw new Error('user cleanup error');
      };
    });

    $el.atomUnmount();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[atom-mount] Cleanup error'),
      expect.any(Error)
    );
    consoleSpy.mockRestore();
    $el.remove();
  });

  it('double atomUnmount() only runs cleanup once', () => {
    const $el = $('<div>').appendTo(document.body);
    const cleanup = vi.fn();

    $el.atomMount(() => cleanup);

    // First unmount: runs cleanup
    $el.atomUnmount();
    expect(cleanup).toHaveBeenCalledTimes(1);

    // Second unmount: should be idempotent
    $el.atomUnmount();
    expect(cleanup).toHaveBeenCalledTimes(1);

    $el.remove();
  });
});
