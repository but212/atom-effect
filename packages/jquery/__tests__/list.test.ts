import $ from 'jquery';
import { describe, expect, it, vi } from 'vitest';
import '../src/index';

describe('Atom List', () => {
  const EXPANDO = 'data-test-expando';

  it('should handle empty state transitions', async () => {
    const list = $.atom<string[]>(['a']);
    const $container = $('<div>').appendTo(document.body);

    $container.atomList(list, {
      key: (item) => item,
      render: (item) => `<span>${item}</span>`,
      empty: '<p>Empty</p>',
    });

    await $.nextTick();
    expect($container.find('span').length).toBe(1);
    expect($container.find('p').length).toBe(0);

    // To Empty
    list.value = [];
    await $.nextTick();
    expect($container.find('span').length).toBe(0);
    expect($container.find('p').text()).toBe('Empty');

    // Back to Filled
    list.value = ['b'];
    await $.nextTick();
    expect($container.find('p').length).toBe(0);
    expect($container.find('span').text()).toBe('b');

    $container.remove();
  });

  it('should reuse existing DOM elements and handle reconciliation', async () => {
    const items = $.atom([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
      { id: 3, text: 'C' },
    ]);
    const $ul = $('<ul>').appendTo(document.body);

    $ul.atomList(items, {
      key: 'id',
      render: (item) => `<li id="item-${item.id}">${item.text}</li>`,
      update: ($el, item) => $el.text(item.text),
    });

    await $.nextTick();

    // Mark elements to verify preservation
    const $elA = $ul.find('#item-1');
    const $elB = $ul.find('#item-2');
    const $elC = $ul.find('#item-3');
    $elA.attr(EXPANDO, 'A');
    $elB.attr(EXPANDO, 'B');
    $elC.attr(EXPANDO, 'C');

    // Rotation: A, B, C -> C, A, B
    items.value = [
      { id: 3, text: 'C' },
      { id: 1, text: 'A-updated' },
      { id: 2, text: 'B' },
    ];

    await $.nextTick();

    const $children = $ul.children();
    expect($children.eq(0).attr('id')).toBe('item-3');
    expect($children.eq(1).attr('id')).toBe('item-1');
    expect($children.eq(2).attr('id')).toBe('item-2');

    // Check preservation and update
    expect($children.eq(1).attr(EXPANDO)).toBe('A');
    expect($children.eq(1).text()).toBe('A-updated');
    expect($children[1] === $elA[0]).toBe(true);

    $ul.remove();
  });

  it('should handle middle insertion and reverse order efficiently', async () => {
    const items = $.atom([1, 3, 5]);
    const $ul = $('<ul>').appendTo(document.body);

    $ul.atomList(items, {
      key: (i) => i,
      render: (i) => `<li>${i}</li>`,
    });

    await $.nextTick();
    const el1 = $ul.children()[0];
    const el3 = $ul.children()[1];

    // Middle insertion: [1, 2, 3, 4, 5]
    items.value = [1, 2, 3, 4, 5];
    await $.nextTick();
    expect($ul.children().length).toBe(5);
    expect($ul.children()[0] === el1).toBe(true);
    expect($ul.children()[2] === el3).toBe(true);

    // Reverse order
    items.value = [5, 4, 3, 2, 1];
    await $.nextTick();
    const reversed = $ul
      .children()
      .map((_, el) => $(el).text())
      .get();
    expect(reversed).toEqual(['5', '4', '3', '2', '1']);

    $ul.remove();
  });

  it('should support bind, onRemove (async), and complex LIS sequences', async () => {
    interface Item {
      id: number;
      name?: string;
    }
    const items = $.atom<Item[]>([{ id: 1, name: 'a' }]);
    const $container = $('<div>').appendTo(document.body);
    let bindCalled = false;
    let removeCalled = false;

    $container.atomList(items, {
      key: (item) => item.id,
      render: (item) => `<span>${item.name}</span>`,
      bind: ($el) => {
        bindCalled = true;
        $el.attr('data-bound', 'true');
      },
      onRemove: async () => {
        removeCalled = true;
        await new Promise((r) => setTimeout(r, 10));
      },
    });

    await $.nextTick();
    expect(bindCalled).toBe(true);

    // Trigger LIS path with complex update
    items.value = [{ id: 4 }, { id: 5 }, { id: 1 }, { id: 2 }, { id: 3 }];
    await $.nextTick();
    expect($container.children().length).toBe(5);
    expect($container.children().eq(2).attr('data-bound')).toBe('true');

    // Async remove
    items.value = [];
    await $.nextTick();
    expect(removeCalled).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect($container.children().length).toBe(0);

    $container.remove();
  });

  it('should add _aes-bound marker class to bound elements', async () => {
    const items = $.atom([
      { id: 1, text: 'A' },
      { id: 2, text: 'B' },
    ]);
    const $ul = $('<ul>').appendTo(document.body);

    $ul.atomList(items, {
      key: 'id',
      render: (item) => `<li>${item.text}</li>`,
      bind: ($el, item) => {
        // Any binding triggers the marker
        $el.atomText($.computed(() => item.text));
      },
    });

    await $.nextTick();

    // Verify marker class is present on bound elements
    const $children = $ul.children();
    expect($children.eq(0).hasClass('_aes-bound')).toBe(true);
    expect($children.eq(1).hasClass('_aes-bound')).toBe(true);

    // Marker should be removed after cleanup
    $ul.remove();
    expect($children.eq(0).hasClass('_aes-bound')).toBe(false);
  });
  it('should warn about duplicate keys in production mode', async () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const items = $.atom([{ id: 1 }, { id: 1 }]); // Duplicate ID
    const $ul = $('<ul>').appendTo(document.body);

    $ul.atomList(items, {
      key: (i) => i.id,
      render: (i) => `<li>${i.id}</li>`,
    });

    await $.nextTick();

    // Expect warning about duplicate keys regardless of debug mode
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Duplicate key'));

    $ul.remove();
    warnSpy.mockRestore();
  });
});
