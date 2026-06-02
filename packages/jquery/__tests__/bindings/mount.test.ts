import $ from 'jquery';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/index';
import { registry } from '@/core/registry';

describe('Atom Mount (Component Lifecycle)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    // registry.cleanupTree handles all remaining bindings,
    // so individual $el.remove() calls in tests are mostly redundant.
    registry.cleanupTree(document.body);
  });

  it('should handle full lifecycle: mount, remount, and unmount', () => {
    const $el = $('<div>').appendTo(document.body);
    const cleanup1 = vi.fn();
    const cleanup2 = vi.fn();

    // 1. Mount
    $el.atomMount(() => {
      $el.text('v1');
      return cleanup1;
    });
    expect($el.text()).toBe('v1');

    // 2. Remount (Should trigger cleanup of v1)
    $el.atomMount(() => {
      $el.text('v2');
      return cleanup2;
    });
    expect(cleanup1).toHaveBeenCalled();
    expect($el.text()).toBe('v2');

    // 3. Unmount
    $el.atomUnmount();
    expect(cleanup2).toHaveBeenCalled();
  });

  it('should support mounting components that return a teardown object ({ unmount })', () => {
    const $el = $('<div>').appendTo(document.body);
    const cleanup = vi.fn();

    $el.atomMount(() => {
      return { unmount: cleanup };
    });

    $el.atomUnmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
    $el.remove();
  });

  it('should recursively cleanup descendants', () => {
    const $parent = $('<div>').appendTo(document.body);
    const $child = $('<div>').appendTo($parent);
    const cleanup = vi.fn();

    $child.atomMount(() => cleanup);
    $parent.atomUnmount();

    expect(cleanup).toHaveBeenCalled();
  });

  it('should cleanup automatically via jQuery methods (remove/empty)', () => {
    const cleanup1 = vi.fn();
    const cleanup2 = vi.fn();

    // Test remove()
    const $el1 = $('<div>')
      .appendTo(document.body)
      .atomMount(() => cleanup1);
    $el1.remove();
    expect(cleanup1).toHaveBeenCalled();

    // Test empty()
    const $parent = $('<div>').appendTo(document.body);
    $('<div>')
      .appendTo($parent)
      .atomMount(() => cleanup2);
    $parent.empty();
    expect(cleanup2).toHaveBeenCalled();
  });

  it('should throw error during mount', () => {
    const $el = $('<div>').appendTo(document.body);
    expect(() => {
      $el.atomMount(() => {
        throw new Error('mount fail');
      });
    }).toThrow('mount fail');
  });

  it('should log cleanup errors during unmount', () => {
    const $el = $('<div>').appendTo(document.body);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Cleanup errors are logged to ensure all resources are disposed
    // even if one part of the cleanup fails.
    $el.atomMount(() => () => {
      throw new Error('cleanup fail');
    });
    $el.atomUnmount();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[atom-mount] Cleanup error'),
      expect.any(Error)
    );

    spy.mockRestore();
  });

  it('should batch updates and be idempotent', () => {
    const $el = $('<div>').appendTo(document.body);
    const count = $.atom(0);
    const cleanup = vi.fn().mockReturnValue(undefined);
    let effectCount = 0;

    $.effect(() => {
      count.value;
      effectCount++;
      return undefined;
    });

    // Batching check: Initial execution (1) + Batched update (1) = 2
    // Without batching, it would be 1 (initial) + 2 (two updates) = 3
    $el.atomMount(() => {
      count.value = 1;
      count.value = 2;
      return cleanup;
    });
    expect(effectCount).toBe(2);

    // Idempotency check: multiple unmounts should only run cleanup once
    $el.atomUnmount();
    $el.atomUnmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('should skip and log when mounting on non-Element nodes', () => {
    const textNode = document.createTextNode('txt');
    const mountFn = vi.fn().mockReturnValue(undefined);

    $(textNode).atomMount(mountFn);
    expect(mountFn).not.toHaveBeenCalled();
  });
});
