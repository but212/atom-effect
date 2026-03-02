import $ from 'jquery';
import { describe, expect, it, vi } from 'vitest';
import { debug } from '../src/utils/debug';
import '../src/index';

describe('Atom List Edge Cases', () => {
  it('should visually collapse items with duplicate keys', async () => {
    // Current behavior: Duplicate keys result in only one DOM element being reused/moved
    // distinct failure mode to document.

    // Enable debug mode to capture warning
    const originalDebug = debug.enabled;
    debug.enabled = true;

    try {
      const items = $.atom([
        { id: 1, text: 'First' },
        { id: 1, text: 'Second' }, // Duplicate ID
      ]);
      const $container = $('<div>').appendTo(document.body);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      $container.atomList(items, {
        key: 'id',
        render: (item) => `<div id="item-${item.id}">${item.text}</div>`,
      });

      await $.nextTick();

      // Expectation: Only 1 element exists because of key collision in Map
      expect($container.children().length).toBe(1);

      // The element likely reflects the LAST item processed in the loop (index 0 or last depending on loop order)
      // Loop is backwards: i = 1 (Second) -> Updates Map Entry (Create new)
      // i = 0 (First) -> Updates Map Entry (Reuse) -> text becomes "First"
      // So final text should be 'First'
      expect($container.find('#item-1').text()).toBe('First');

      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
      $container.remove();
    } finally {
      debug.enabled = originalDebug;
    }
  });

  it('should result in two elements during async removal race', async () => {
    // "Ghost" element persists while new element with same key is added
    const items = $.atom([{ id: 1, text: 'A' }]);
    const $container = $('<div>').appendTo(document.body);

    let resolveRemove: () => void;
    const removePromise = new Promise<void>((r) => {
      resolveRemove = r;
    });

    $container.atomList(items, {
      key: 'id',
      render: (item) => `<div class="item">${item.text}</div>`,
      onRemove: async ($el) => {
        $el.addClass('removing');
        await removePromise;
        $el.remove();
      },
    });

    await $.nextTick();
    expect($container.children().length).toBe(1);

    // 1. Remove
    items.value = [];
    await $.nextTick();
    expect($container.children('.removing').length).toBe(1); // Old one still there

    // 2. Add back immediately (with same key)
    items.value = [{ id: 1, text: 'A New' }];
    await $.nextTick();

    // Expectation:
    // Old one is "removing"
    // New one is rendered (because Map entry was deleted synchronously in step 1 phase)
    // So total 2 elements
    expect($container.children().length).toBe(2);
    expect($container.children('.removing').text()).toBe('A');
    expect($container.children(':not(.removing)').text()).toBe('A New');

    // Finish removal
    resolveRemove!();
    await $.nextTick(); // wait for promise resolution in onRemove wrapper
    await new Promise((r) => setTimeout(r, 0)); // Microtask flush

    // Old one gone, new one remains
    expect($container.children().length).toBe(1);
    expect($container.children().text()).toBe('A New');

    $container.remove();
  });

  it('should preserve focus when reordering elements synchronously', async () => {
    // Note: JSDOM focus handling with detach/attach is tricky.
    // jQuery .insertBefore moves the element.
    const items = $.atom([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const $container = $('<div>').appendTo(document.body);

    $container.atomList(items, {
      key: 'id',
      render: (item) => `<div><input id="input-${item.id}" /></div>`,
    });

    await $.nextTick();

    const input1 = document.getElementById('input-1') as HTMLInputElement;
    const _input2 = document.getElementById('input-2') as HTMLInputElement;
    const _input3 = document.getElementById('input-3') as HTMLInputElement;

    input1.focus();
    expect(document.activeElement).toBe(input1);

    // Reorder: 3, 1, 2
    items.value = [{ id: 3 }, { id: 1 }, { id: 2 }];
    await $.nextTick();

    // Verify DOM order
    const children = $container.children();
    expect(children.eq(0).find('input').attr('id')).toBe('input-3');
    expect(children.eq(1).find('input').attr('id')).toBe('input-1');
    expect(children.eq(2).find('input').attr('id')).toBe('input-2');

    // Verify Focus Preserved
    // In real browser, moving node usually preserves focus.
    // In JSDOM? It might lose it if detached.
    // nextNode logic uses .insertBefore.
    // If element is already in document, .insertBefore moves it. It is NOT detached.
    // So focus should be preserved.
    expect(document.activeElement).toBe(input1);

    $container.remove();
  });
});
