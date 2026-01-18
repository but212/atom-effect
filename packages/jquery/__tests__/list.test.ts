import $ from 'jquery';
import { describe, expect, it } from 'vitest';
import '../src/index';

describe('Atom List', () => {
  it('should handle empty state with render option', async () => {
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

    list.value = [];
    await $.nextTick();
    expect($container.find('span').length).toBe(0);
    expect($container.find('p').text()).toBe('Empty');

    list.value = ['b'];
    await $.nextTick();
    expect($container.find('p').length).toBe(0);
    expect($container.find('span').text()).toBe('b');

    $container.remove();
  });

  it('should move items to the end (appendTo path)', async () => {
    const list = $.atom(['a', 'b', 'c']);
    const $container = $('<div>').appendTo(document.body);

    $container.atomList(list, {
      key: (item) => item,
      render: (item) => `<div id="${item}">${item}</div>`,
    });

    await $.nextTick();

    // Move 'a' to the end: ['b', 'c', 'a']
    list.value = ['b', 'c', 'a'];
    await $.nextTick();

    const children = $container.children();
    expect(children.get(0)!.id).toBe('b');
    expect(children.get(1)!.id).toBe('c');
    expect(children.get(2)!.id).toBe('a');

    $container.remove();
  });

  it('should handle complex LIS sequences to trigger binary search paths', async () => {
    // A sequence that triggers binary search updates in LIS
    // New indices relative to old list
    // say old list was [1, 2, 3, 4, 5]
    // new list is [4, 5, 1, 2, 3]
    // indices in old list: [3, 4, 0, 1, 2]

    const list = $.atom([1, 2, 3, 4, 5]);
    const $container = $('<div>').appendTo(document.body);

    $container.atomList(list, {
      key: (item) => item,
      render: (item) => `<div>${item}</div>`,
    });

    await $.nextTick();

    list.value = [4, 5, 1, 2, 3];
    await $.nextTick();

    const result = $container
      .children()
      .map((_, el) => $(el).text())
      .get();
    expect(result).toEqual(['4', '5', '1', '2', '3']);

    $container.remove();
  });

  it('atomList should support bind and onRemove (async)', async () => {
    const items = $.atom([{ id: 1, name: 'a' }]);
    const $container = $('<div>').appendTo(document.body);
    let bindCalled = false;
    let removeCalled = false;

    $container.atomList(items, {
      key: (item) => item.id,
      render: (item) => `<span>${item.name}</span>`,
      bind: ($el, _item) => {
        bindCalled = true;
        $el.attr('data-bound', 'true');
      },
      onRemove: async (_$el) => {
        removeCalled = true;
        await new Promise(r => setTimeout(r, 10));
      }
    });

    await $.nextTick();
    expect(bindCalled).toBe(true);
    expect($container.find('span').attr('data-bound')).toBe('true');

    items.value = [];
    await $.nextTick();
    expect(removeCalled).toBe(true);
    // Wait for async removal
    await new Promise(r => setTimeout(r, 20));
    expect($container.children().length).toBe(0);

    $container.remove();
  });

  it('atomList should handle empty to empty updates', async () => {
    const items = $.atom<any[]>([]);
    const $ul = $('<ul>').appendTo(document.body);
    $ul.atomList(items, { 
      key: (i) => i.id, 
      render: () => '', 
      empty: '<li class="empty">empty</li>' 
    });
    
    await $.nextTick();
    expect($ul.find('.empty').length).toBe(1);

    // Trigger update with same empty array (new reference)
    items.value = [];
    await $.nextTick();
    expect($ul.find('.empty').length).toBe(1);

    $ul.remove();
  });
});
