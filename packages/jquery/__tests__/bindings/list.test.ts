import $ from 'jquery';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/index';

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

  describe('Events Delegation', () => {
    it('calls handler with (item, index, event) when delegated child is clicked', async () => {
      interface User {
        id: number;
        name: string;
      }
      const users = $.atom<User[]>([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
      const handler = vi.fn();
      const $container = $('<ul>').appendTo(document.body);

      $container.atomList(users, {
        key: 'id',
        render: (u) => `<li data-id="${u.id}"><button class="del">x</button></li>`,
        events: {
          'click .del': handler,
        },
      });

      await $.nextTick();

      const $btn = $container.find('li').eq(1).find('.del');
      click($btn[0]!);

      expect(handler).toHaveBeenCalledTimes(1);
      const [item, index, e] = handler.mock.calls[0]!;
      expect(item).toEqual({ id: 2, name: 'Bob' });
      expect(index).toBe(1);
      expect(e).toBeDefined();
      $container.remove();
    });

    it('calls handler when item root element is clicked (no selector)', async () => {
      const items = $.atom([{ id: 10 }, { id: 20 }]);
      const handler = vi.fn();
      const $container = $('<ul>').appendTo(document.body);

      $container.atomList(items, {
        key: 'id',
        render: (item) => `<li data-id="${item.id}"></li>`,
        events: {
          click: handler,
        },
      });

      await $.nextTick();

      const $li = $container.find('[data-id="10"]');
      click($li[0]!);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]![0]).toEqual({ id: 10 });
      expect(handler.mock.calls[0]![1]).toBe(0);
      $container.remove();
    });

    it('fires handler for every item in the list via a single delegated listener', async () => {
      const items = $.atom([1, 2, 3, 4, 5].map((id) => ({ id })));
      const handler = vi.fn();
      const $container = $('<ul>').appendTo(document.body);

      $container.atomList(items, {
        key: 'id',
        render: (item) => `<li data-id="${item.id}"></li>`,
        events: { click: handler },
      });

      await $.nextTick();

      $container.find('li').each((_, el) => click(el));

      expect(handler).toHaveBeenCalledTimes(5);
      const receivedIds = handler.mock.calls.map((c) => (c[0] as { id: number }).id);
      expect(receivedIds).toEqual([1, 2, 3, 4, 5]);
      $container.remove();
    });

    it('does not call handler for items that have been removed from the list', async () => {
      const items = $.atom([{ id: 1 }, { id: 2 }]);
      const handler = vi.fn();
      const $container = $('<ul>').appendTo(document.body);

      $container.atomList(items, {
        key: 'id',
        render: (item) => `<li data-id="${item.id}"></li>`,
        events: { click: handler },
      });

      await $.nextTick();
      const $removedLi = $container.find('[data-id="1"]');

      items.value = [{ id: 2 }];
      await $.nextTick();

      click($removedLi[0]!);
      expect(handler).not.toHaveBeenCalled();
      $container.remove();
    });

    it('removes the delegated listener when the container element is unbound', async () => {
      const items = $.atom([{ id: 1 }]);
      const handler = vi.fn();
      const $container = $('<ul>').appendTo(document.body);

      $container.atomList(items, {
        key: 'id',
        render: () => `<li><button class="btn">go</button></li>`,
        events: { 'click .btn': handler },
      });

      await $.nextTick();
      click($container.find('.btn')[0]!);
      expect(handler).toHaveBeenCalledTimes(1);

      $container.atomUnbind();
      handler.mockClear();
      click($container.find('.btn')[0]!);
      expect(handler).not.toHaveBeenCalled();
      $container.remove();
    });

    it('reports the current list index after items are reordered', async () => {
      const items = $.atom([{ id: 1 }, { id: 2 }, { id: 3 }]);
      const handler = vi.fn();
      const $container = $('<ul>').appendTo(document.body);

      $container.atomList(items, {
        key: 'id',
        render: (item) => `<li data-id="${item.id}"></li>`,
        events: { click: handler },
      });

      await $.nextTick();
      items.value = [{ id: 3 }, { id: 2 }, { id: 1 }];
      await $.nextTick();

      click($container.find('[data-id="1"]')[0]!);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]![0]).toEqual({ id: 1 });
      expect(handler.mock.calls[0]![1]).toBe(2);
      $container.remove();
    });

    it('childSelector must not escape outside the item root', async () => {
      const $outer = $('<div class="btn">').appendTo(document.body);
      const $container = $('<ul>').appendTo($outer);
      const items = $.atom([{ id: 1 }]);
      const handler = vi.fn();

      $container.atomList(items, {
        key: 'id',
        render: () => `<li>text</li>`,
        events: { 'click .btn': handler },
      });

      await $.nextTick();
      click($container.find('li')[0]!);
      expect(handler).not.toHaveBeenCalled();

      $outer.remove();
    });
  });

  // ---------------------------------------------------------------------------
  // Regression & Edge Cases
  // ---------------------------------------------------------------------------

  it('re-adding a key during async onRemove should not produce duplicate nodes', async () => {
    let resolveRemove!: () => void;
    const items = $.atom([{ id: 1 }]);
    const $container = $('<div>').appendTo(document.body);

    $container.atomList(items, {
      key: (item) => item.id,
      render: () => `<span data-id="1"></span>`,
      onRemove: () =>
        new Promise<void>((r) => {
          resolveRemove = r;
        }),
    });

    await $.nextTick();
    items.value = [];
    await $.nextTick();
    items.value = [{ id: 1 }];
    await $.nextTick();

    resolveRemove();
    await new Promise((r) => setTimeout(r, 10));

    expect($container.find('span[data-id="1"]').length).toBe(1);
    $container.remove();
  });

  it('replaceWith on data change should dispose old element effects', async () => {
    let effectRunCount = 0;
    const nameAtom = $.atom('Alice');
    const items = $.atom([{ id: 1, name: 'Alice' }]);
    const $container = $('<div>').appendTo(document.body);
    let firstEl: HTMLElement | undefined;

    $container.atomList(items, {
      key: (item) => item.id,
      render: (item) => `<span>${item.name}</span>`,
      bind: ($el) => {
        if (!firstEl) firstEl = $el[0];
        $el.atomText(
          $.computed(() => {
            effectRunCount++;
            return nameAtom.value;
          })
        );
      },
    });

    await $.nextTick();
    effectRunCount = 0;
    items.value = [{ id: 1, name: 'Bob' }];
    await $.nextTick();
    effectRunCount = 0;
    nameAtom.value = 'Charlie';
    await $.nextTick();

    expect(effectRunCount).toBe(1);
    expect(firstEl?.classList.contains('_aes-bound')).toBe(false);
    $container.remove();
  });

  it('async-removing keys should not distort LIS-based reordering', async () => {
    const items = $.atom([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const $container = $('<div>').appendTo(document.body);

    $container.atomList(items, {
      key: (item) => item.id,
      render: (item) => `<span data-id="${item.id}"></span>`,
      onRemove: () => new Promise((r) => setTimeout(r, 30)),
    });

    await $.nextTick();
    items.value = [{ id: 3 }, { id: 1 }];
    await $.nextTick();
    await new Promise((r) => setTimeout(r, 50));

    const order = $container
      .find('span')
      .map((_, el) => el.getAttribute('data-id'))
      .get();
    expect(order).toEqual(['3', '1']);
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

  it('should not fire events on stale elements undergoing async removal when keys are reused', async () => {
    let resolveRemove!: () => void;
    const items = $.atom([{ id: 1, text: 'old' }]);
    const $container = $('<div>').appendTo(document.body);
    let handlerItem: { id: number; text: string } | null = null;

    $container.atomList(items, {
      key: 'id',
      render: (item) => `<button class="btn">${item.text}</button>`,
      onRemove: () =>
        new Promise<void>((r) => {
          resolveRemove = r;
        }),
      events: {
        'click .btn': (item) => {
          handlerItem = item;
        },
      },
    });

    await $.nextTick();
    const $oldBtn = $container.find('.btn');
    items.value = [];
    await $.nextTick();
    items.value = [{ id: 1, text: 'new' }];
    await $.nextTick();

    $oldBtn.trigger('click');
    expect(handlerItem).toBeNull();

    resolveRemove();
    await new Promise((r) => setTimeout(r, 10));
    $container.remove();
  });

  it('should re-render when an item is shallow-copied after deep mutation (Demonstrating shallowEqual issue)', async () => {
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
