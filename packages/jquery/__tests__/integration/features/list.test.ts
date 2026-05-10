import { describe, expect, it, vi } from 'vitest';
import $ from '@/index';

describe('Atom List Edge Cases', () => {
  it('should visually collapse items with duplicate keys', async () => {
    // Current behavior: Duplicate keys result in only one DOM element being reused/moved
    // distinct failure mode to document.

    // Enable debug mode to capture warning
    const originalDebug = $.debug.enabled;
    $.debug.enabled = true;

    try {
      const items = $.atom([
        { id: 1, text: 'First' },
        { id: 1, text: 'Second' }, // Duplicate ID
      ]);
      const $container = $('<div>').appendTo(document.body);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      $container.atomList(items, {
        key: 'id',
        render: (item: { id: number; text: string }) =>
          `<div id="item-${item.id}">${item.text}</div>`,
      });

      await $.nextTick();

      // Expectation: Only 1 element exists because of key collision in Map
      expect($container.children().length).toBe(1);

      // Expected Behavior under 1D Array Architecture:
      // buildIndices scans forward. The first item creates the index entry.
      // The second duplicate is skipped entirely (newIndices[i] = -1).
      // During placeItems, the undefined slot for the duplicate is ignored.
      // Therefore, ONLY the first item is rendered.
      expect($container.find('#item-1').text()).toBe('First');

      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
      $container.remove();
    } finally {
      $.debug.enabled = originalDebug;
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
      render: (item: { id: number; text: string }) => `<div class="item">${item.text}</div>`,
      onRemove: async ($el: JQuery<HTMLElement>) => {
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
    expect(document.activeElement).toBe(input1);

    $container.remove();
  });

  it('should correctly render many items without losing sentinels during batchSanitize', async () => {
    // This triggers the internal batchSanitize logic in renderItems
    const count = 20;
    const items = $.atom(Array.from({ length: count }, (_, i) => ({ id: i, text: `Item ${i}` })));
    const $container = $('<div>').appendTo(document.body);

    $container.atomList(items, {
      key: 'id',
      render: (item: { id: number; text: string }) => `<div>${item.text}</div>`,
    });

    await $.nextTick();

    expect($container.children().length).toBe(count);
    for (let i = 0; i < count; i++) {
      expect($container.children().eq(i).text()).toBe(`Item ${i}`);
    }

    $container.remove();
  });
});
