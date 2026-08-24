import { describe, expect, it, vi } from 'vitest';
import $ from '@/index';
import { setupDOMCleanup } from '../../utils/test-helpers';

describe('Atom List Edge Cases', () => {
  const { appendToBody } = setupDOMCleanup();
  it('should render both items with duplicate keys and warn', async () => {
    // Updated contract: duplicate keys are warned about but BOTH items render,
    // so no data is silently dropped from the DOM.

    // Enable debug mode to capture warning
    const originalDebug = $.debug.enabled;
    $.debug.enabled = true;

    try {
      const items = $.atom([
        { id: 1, text: 'First' },
        { id: 1, text: 'Second' }, // Duplicate ID
      ]);
      const $container = appendToBody('<div>');
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      $container.atomList(items, {
        key: 'id',
        render: (item: { id: number; text: string }) => `<div class="dup-item">${item.text}</div>`,
      });

      await $.nextTick();

      // Both duplicate-key items are rendered
      expect($container.children().length).toBe(2);
      const texts = $container
        .find('.dup-item')
        .map((_, element) => $(element).text())
        .get();
      expect(texts).toEqual(['First', 'Second']);

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
    const $container = appendToBody('<div>');

    let resolveRemove: (() => void) | undefined;
    const removePromise = new Promise<void>((resolve) => {
      resolveRemove = resolve;
    });

    $container.atomList(items, {
      key: 'id',
      render: (item: { id: number; text: string }) => `<div class="item">${item.text}</div>`,
      onRemove: async ($element: JQuery<HTMLElement>) => {
        $element.addClass('removing');
        await removePromise;
        $element.remove();
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
    resolveRemove?.();
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
    const $container = appendToBody('<div>');

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
    const items = $.atom(
      Array.from({ length: count }, (_, index) => ({ id: index, text: `Item ${index}` }))
    );
    const $container = appendToBody('<div>');

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
