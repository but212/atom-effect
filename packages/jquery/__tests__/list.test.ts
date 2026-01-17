import { describe, it, expect } from 'vitest';
import $ from 'jquery';
import '../src/index';

describe('List Rendering', () => {
  it('should render list', async () => {
    const items = $.atom([{ id: 1, text: 'A' }, { id: 2, text: 'B' }]);
    const $ul = $('<ul>').appendTo(document.body);
    
    $ul.atomList(items, {
        key: 'id',
        render: (item) => `<li id="item-${item.id}">${item.text}</li>`
    });

    await $.nextTick();
    expect($ul.children().length).toBe(2);
    expect($ul.find('#item-1').text()).toBe('A');
    expect($ul.find('#item-2').text()).toBe('B');

    // Add item
    items.value = [...items.value, { id: 3, text: 'C' }];
    await $.nextTick();
    expect($ul.children().length).toBe(3);
    
    // Remove item
    items.value = items.value.filter(i => i.id !== 2);
    await $.nextTick();
    expect($ul.children().length).toBe(2);
    expect($ul.find('#item-2').length).toBe(0);
    
    $ul.remove();
  });
  it('should handle onAdd/onRemove callbacks', async () => {
    const list = $.atom<{id:number}[]>([{id:1}]);
    const $ul = $('<ul>').appendTo(document.body);
    const added: number[] = [];
    const removed: number[] = [];

    $ul.atomList(list, {
      key: 'id',
      render: (item) => `<li id="item-${item.id}">${item.id}</li>`,
      onAdd: ($el) => added.push(Number($el.text())),
      onRemove: ($el) => {
        removed.push(Number($el.text()));
        return new Promise(r => setTimeout(r, 10)); // Async remove
      }
    });

    await $.nextTick();
    expect(added).toEqual([1]);

    list.value = [{id:2}]; // Replace 1 with 2
    await $.nextTick();
    
    // Check added
    expect(added).toEqual([1, 2]);

    // Check removed (async wait)
    await new Promise(r => setTimeout(r, 20));
    expect(removed).toEqual([1]);
    
    $ul.remove();
  });

  it('should handle empty option', async () => {
    const list = $.atom<number[]>([]);
    const $ul = $('<ul>').appendTo(document.body);
    
    $ul.atomList(list, {
      key: (i) => i,
      render: (i) => `<li>${i}</li>`,
      empty: '<li class="empty">No Items</li>'
    });
    
    await $.nextTick();
    expect($ul.find('.empty').length).toBe(1);
    expect($ul.text()).toBe('No Items');
    
    list.value = [1];
    await $.nextTick();
    expect($ul.find('.empty').length).toBe(0);
    expect($ul.text()).toBe('1');
    
    list.value = [];
    await $.nextTick();
    expect($ul.find('.empty').length).toBe(1);
    
    $ul.remove();
  });
});
