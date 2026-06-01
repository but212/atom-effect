import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import $ from '@/index';

describe('$.atomList (Integration)', () => {
  const EXPANDO = 'data-test-expando';

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    $(document.body).empty();
  });

  /** Simulate a click on `el`, bubbling up through jQuery's event system. */
  function click(el: HTMLElement): void {
    $(el).trigger('click');
  }

  describe('Core Rendering & Reconciliation', () => {
    it('should handle empty state transitions', async () => {
      const list = $.atom<string[]>(['a']);
      const $container = $('<div>').appendTo(document.body);

      $container.atomList(list, {
        key: (item: string) => item,
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

      // [Stability] Releasing empty list multiple times should not corrupt internal state
      list.value = [];
      list.value = [];
      list.value = ['c'];
      await $.nextTick();
      expect($container.find('span').text()).toBe('c');

      $container.remove();
    });

    it('should support items with multiple root elements and correct key mapping', async () => {
      const items = $.atom([{ id: 1 }, { id: 2 }]);
      const $container = $('<div>').appendTo(document.body);

      $container.atomList(items, {
        key: 'id',
        // One item renders 2 elements
        render: (item) => `<i class="prefix">${item.id}</i><b class="content">${item.id}</b>`,
      });

      await $.nextTick();

      const $children = $container.children();
      expect($children.length).toBe(4); // 2 elements * 2 items

      // Ensure all root elements belonging to the same item share the same key
      expect($children.eq(0).attr('data-atom-key')).toBe('1');
      expect($children.eq(1).attr('data-atom-key')).toBe('1');
      expect($children.eq(2).attr('data-atom-key')).toBe('2');
      expect($children.eq(3).attr('data-atom-key')).toBe('2');

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

      const $elA = $ul.find('#item-1');
      $elA.attr(EXPANDO, 'A');
      $ul.find('#item-2').attr(EXPANDO, 'B');
      $ul.find('#item-3').attr(EXPANDO, 'C');

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
      expect($children.eq(1).attr(EXPANDO)).toBe('A');
      expect($children.eq(1).text()).toBe('A-updated');
      expect($children[1] === $elA[0]).toBe(true);

      $ul.remove();
    });

    it('should handle middle insertion and reverse order efficiently', async () => {
      const items = $.atom([1, 3, 5]);
      const $ul = $('<ul>').appendTo(document.body);

      $ul.atomList(items, {
        key: (i: number) => i,
        render: (i) => `<li>${i}</li>`,
      });

      await $.nextTick();
      const el1 = $ul.children()[0];
      const el3 = $ul.children()[1];

      items.value = [1, 2, 3, 4, 5];
      await $.nextTick();
      expect($ul.children().length).toBe(5);
      expect($ul.children()[0] === el1).toBe(true);
      expect($ul.children()[2] === el3).toBe(true);

      items.value = [5, 4, 3, 2, 1];
      await $.nextTick();
      const reversed = $ul
        .children()
        .map((_, el) => $(el).text())
        .get();
      expect(reversed).toEqual(['5', '4', '3', '2', '1']);

      $ul.remove();
    });

    it('should not use innerHTML optimization if item contains text nodes', async () => {
      const list = $.atom(['A']);
      const $container = $('<div>').appendTo(document.body);

      $container.atomList(list, {
        key: (i: string) => i,
        render: (i: string) => ` ${i} <span>X</span>`, // Leading space and span
      });

      await $.nextTick();
      list.value = ['B'];
      await $.nextTick();

      expect($container.text().includes('B')).toBe(true);
      expect($container.find('span').length).toBe(1);
      $container.remove();
    });

    it('should not duplicate elements when replacing multi-root items', async () => {
      const list = $.atom([{ id: 1, text: 'A' }]);
      const $container = $('<div>').appendTo(document.body);

      $container.atomList(list, {
        key: 'id',
        render: (item) => `<b class="root1">${item.id}</b><i class="root2">${item.text}</i>`,
      });

      await $.nextTick();
      expect($container.children().length).toBe(2);

      // Update item (force replacement by changing content without update fn)
      list.value = [{ id: 1, text: 'B' }];
      await $.nextTick();

      expect($container.children().length).toBe(2);
      expect($container.find('.root2').text()).toBe('B');
      $container.remove();
    });

    it('should re-render when an item is shallow-copied after deep mutation (isEqual: false)', async () => {
      const items = $.atom([{ id: 1, nested: { val: 1 } }]);
      const $ul = $('<ul>').appendTo(document.body);

      $ul.atomList(items, {
        key: 'id',
        render: (item) => `<li id="item-${item.id}">${item.nested.val}</li>`,
        isEqual: () => false,
      });

      await $.nextTick();
      expect($ul.find('li').text()).toBe('1');

      const item = items.value[0]!;
      item.nested.val = 2;
      items.value = [{ ...item }];
      await $.nextTick();

      expect($ul.find('li').text()).toBe('2');
      $ul.remove();
    });
  });

  describe('Lifecycle & Cleanup', () => {
    it('should dispose effect on re-render without relying on internal classes', async () => {
      let runCount = 0;
      const items = $.atom([{ id: 1, val: 'a' }]);
      const trigger = $.atom(0);
      const $container = $('<div>').appendTo(document.body);

      $container.atomList(items, {
        key: 'id',
        render: () => `<span></span>`,
        bind: ($el) => {
          $el.atomText(
            $.computed(() => {
              trigger.value; // Dependency
              runCount++;
              return '';
            })
          );
        },
      });

      await $.nextTick();
      expect(runCount).toBe(1);

      // Force re-render of item 1 (new object, same key)
      items.value = [{ id: 1, val: 'b' }];
      await $.nextTick();

      // Trigger change should only run the NEW effect once
      runCount = 0;
      trigger.value++;
      await $.nextTick();

      expect(runCount).toBe(1); // If > 1, old effect wasn't disposed
      $container.remove();
    });

    it('should clean up previous instance when atomList is called multiple times on the same element', async () => {
      const list1 = $.atom([1, 2]);
      const list2 = $.atom(['A', 'B']);
      const $container = $('<ul>').appendTo(document.body);
      let render1Count = 0;

      $container.atomList(list1, {
        key: (i: number) => i,
        render: (i) => {
          render1Count++;
          return `<li>${i}</li>`;
        },
      });

      await $.nextTick();
      expect(render1Count).toBe(2);

      $container.atomList(list2, {
        key: (i: string) => i,
        render: (i) => `<li>${i}</li>`,
      });

      await $.nextTick();
      expect($container.children().length).toBe(2);
      expect($container.children().eq(0).text()).toBe('A');

      render1Count = 0;
      list1.value = [1, 2, 3];
      await $.nextTick();
      expect(render1Count).toBe(0);
      $container.remove();
    });
  });

  describe('Events Delegation', () => {
    it('should delegate events with correct context and handle lifecycle', async () => {
      const items = $.atom([{ id: 1 }, { id: 2 }]);
      const handler = vi.fn();
      const $container = $('<ul>').appendTo(document.body);

      $container.atomList(items, {
        key: 'id',
        render: (item) => `<li class="row"><button class="btn">${item.id}</button></li>`,
        events: {
          'click .btn': handler,
          click: handler,
        },
      });

      await $.nextTick();

      // 1. Child selector delegation and context (item, index, event)
      const $btn = $container.find('.btn').eq(1);
      click($btn[0]!);
      expect(handler).toHaveBeenCalledTimes(2); // btn click + li bubble
      const [item, index, e] = handler.mock.calls[0]!;
      expect(item).toEqual({ id: 2 });
      expect(index).toBe(1);
      expect(e).toBeDefined();

      // 2. Index reporting after reorder
      items.value = [{ id: 2 }, { id: 1 }];
      await $.nextTick();
      handler.mockClear();
      click($container.find('.btn').eq(0)[0]!); // Item 2 is now at index 0
      expect(handler.mock.calls[0]![1]).toBe(0);

      // 3. Child selector scoping (must not escape item root)
      const $outer = $('<div class="outside-btn">').appendTo(document.body);
      const handler2 = vi.fn();
      $container.atomList(items, {
        key: 'id',
        render: () => `<li>text</li>`,
        events: { 'click .outside-btn': handler2 },
      });
      await $.nextTick();
      click($container.find('li')[0]!);
      expect(handler2).not.toHaveBeenCalled();

      // 4. Unbind cleanup
      $container.atomUnbind();
      handler.mockClear();
      click($container.find('.btn').eq(0)[0]!);
      expect(handler).not.toHaveBeenCalled();

      $outer.remove();
      $container.remove();
    });

    it('should ignore events from removed or async-removing items', async () => {
      let resolveRemove!: () => void;
      const items = $.atom([{ id: 1 }, { id: 2 }]);
      const handler = vi.fn();
      const $container = $('<div>').appendTo(document.body);

      $container.atomList(items, {
        key: 'id',
        render: (item) => `<button class="btn">${item.id}</button>`,
        onRemove: () =>
          new Promise<void>((r) => {
            resolveRemove = r;
          }),
        events: { 'click .btn': handler },
      });

      await $.nextTick();
      const $btn1 = $container.find('.btn').eq(0);

      // Remove item 1, but it stays in DOM due to async onRemove
      items.value = [{ id: 2 }];
      await $.nextTick();

      click($btn1[0]!);
      expect(handler).not.toHaveBeenCalled();

      resolveRemove();
      $container.remove();
    });

    it('should correctly trigger parent events even if triggered from within a nested list', async () => {
      const parentItems = $.atom([{ id: 'p1', children: ['c1', 'c2'] }]);
      const parentHandler = vi.fn();
      const childHandler = vi.fn();
      const $container = $('<div>').appendTo(document.body);

      $container.atomList(parentItems, {
        key: 'id',
        render: (pItem) =>
          `<div class="parent-item" id="${pItem.id}"><div class="child-list"></div></div>`,
        bind: ($parentEl, pItem) => {
          const childItems = $.atom(pItem.children);
          $parentEl.find('.child-list').atomList(childItems, {
            key: (cItem) => cItem,
            render: (cItem) => `<button class="child-btn" id="${cItem}">${cItem}</button>`,
            events: {
              'click .child-btn': childHandler,
            },
          });
        },
        events: {
          'click .child-btn': parentHandler,
        },
      });

      await $.nextTick();

      const $btn = $container.find('.child-btn').eq(0);
      click($btn[0]!);

      expect(childHandler).toHaveBeenCalledTimes(1);
      expect(parentHandler).toHaveBeenCalledTimes(1);

      $container.remove();
    });
  });

  describe('Async & Race Conditions', () => {
    it('should manage DOM integrity during async removals and re-entries', async () => {
      let resolveRemove!: () => void;
      const items = $.atom([{ id: 1 }, { id: 2 }, { id: 3 }]);
      const $container = $('<div>').appendTo(document.body);

      $container.atomList(items, {
        key: 'id',
        render: (i) => `<span data-id="${i.id}"></span>`,
        onRemove: () =>
          new Promise<void>((r) => {
            resolveRemove = r;
          }),
      });

      await $.nextTick();

      // 1. Reorder and removal simultaneously
      items.value = [{ id: 3 }, { id: 1 }];
      await $.nextTick();

      // 2. Re-add an item while it is still being removed
      items.value = [{ id: 3 }, { id: 2 }, { id: 1 }];
      await $.nextTick();

      resolveRemove();
      await new Promise((r) => setTimeout(r, 20));

      const order = $container
        .find('span')
        .map((_, el) => $(el).attr('data-id'))
        .get();

      expect(order).toEqual(['3', '2', '1']);
      expect($container.find('span').length).toBe(3); // No duplicate for '2'
      $container.remove();
    });

    it('should not remove item if it was re-added before async removal finishes (race condition)', async () => {
      let resolveRemove!: () => void;
      const items = $.atom([{ id: 1 }]);
      const $container = $('<div>').appendTo(document.body);

      $container.atomList(items, {
        key: 'id',
        render: (i: { id: number }) => `<span class="item-${i.id}"></span>`,
        onRemove: () =>
          new Promise<void>((r) => {
            resolveRemove = r;
          }),
      });

      await $.nextTick();

      // Remove item
      items.value = [];
      await $.nextTick();
      expect($container.find('.item-1').length).toBe(1); // Still there (async)

      // Re-add item (same key)
      items.value = [{ id: 1 }];
      await $.nextTick();

      // Complete the old removal
      resolveRemove();
      await $.nextTick();

      // The item should STILL be there because it was re-added
      expect($container.find('.item-1').length).toBe(1);
      $container.remove();
    });
  });

  describe('Edge Cases & Robustness', () => {
    it('should ignore duplicate keys gracefully without crashing during updates', async () => {
      // Unique keys first to bypass initial fragment-optimization
      const items = $.atom([{ id: 1 }, { id: 2 }]);
      const $container = $('<div>').appendTo(document.body);

      $container.atomList(items, {
        key: 'id',
        render: (item) => `<span>${item.id}</span>`,
      });

      await $.nextTick();

      // Inject duplicate key "3" in the middle of update
      items.value = [{ id: 1 }, { id: 3 }, { id: 3 }, { id: 2 }];

      await $.nextTick();

      // Primary items remain, duplicate is ignored
      expect($container.find('span').length).toBe(3); // 1, 3, 2
      $container.remove();
    });

    it('should correctly handle trimming logic when old item was ignored due to duplicate keys', async () => {
      const list = $.atom([{ id: 1 }, { id: 2 }, { id: 2 }]); // Initial with duplicate
      const $container = $('<div>').appendTo(document.body);

      $container.atomList(list, {
        key: 'id',
        render: (i: { id: number }) => `<span>${i.id}</span>`,
      });

      await $.nextTick();

      // Shift items so the duplicate-hole is now matched during suffix trimming
      list.value = [{ id: 1 }, { id: 3 }, { id: 2 }];
      await $.nextTick();

      expect($container.find('span').length).toBe(3);
      $container.remove();
    });
  });
});
