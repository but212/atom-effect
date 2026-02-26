import $ from 'jquery';
import { describe, expect, it } from 'vitest';
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
      key: (i) => i,
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

  // ---------------------------------------------------------------------------
  // Regression
  // ---------------------------------------------------------------------------

  it('re-adding a key during async onRemove should not produce duplicate nodes', async () => {
    // commitRemoval captures $el at schedule time, so resolving the old
    // onRemove after the same key has been re-inserted removes only the old
    // node — the new node must survive.
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
    // Without registry.cleanup() before replaceWith, the old element retains
    // its _aes-bound marker and its reactive effects keep firing after detach.
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
    // Keys undergoing async removal must be excluded from LIS index lookup
    // so their stale old-positions don't anchor surviving items incorrectly.
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

  it('should support delegated event handlers via events option', async () => {
    const items = $.atom([
      { id: 1, text: 'Apple' },
      { id: 2, text: 'Banana' },
    ]);
    const $container = $('<ul>').appendTo(document.body);

    let lastClickedItem: { id: number; text: string } | null = null;
    let lastClickedIndex = -1;
    let mouseEnterFired = false;
    let handlerThis: HTMLElement | null = null;

    $container.atomList(items, {
      key: 'id',
      render: (item) =>
        `<li><button class="btn">${item.text}</button><span class="other"></span></li>`,
      events: {
        'click .btn': function (item, index, _e) {
          lastClickedItem = item;
          lastClickedIndex = index;
          handlerThis = this as unknown as HTMLElement; // Capture contextual 'this'
        },
        mouseenter: (item, _index, _e) => {
          // No child selector -> event fires on the item root
          lastClickedItem = item;
          mouseEnterFired = true;
        },
      },
    });

    await $.nextTick();

    // 1. Test child selector (.btn)
    const $btn = $container.find('li').eq(0).find('.btn');
    $btn.trigger('click');
    expect(lastClickedItem).toEqual({ id: 1, text: 'Apple' });
    expect(lastClickedIndex).toBe(0);
    expect(handlerThis).toBe($btn[0]); // Verify 'this' context

    // 2. Click outside the selector should not trigger
    lastClickedItem = null;
    $container.find('li').eq(0).find('.other').trigger('click');
    expect(lastClickedItem).toBeNull();

    // 3. Test without child selector (mouseenter on the root element itself)
    lastClickedItem = null;
    $container.find('li').eq(1).trigger('mouseenter');
    expect(lastClickedItem).toEqual({ id: 2, text: 'Banana' });
    expect(mouseEnterFired).toBe(true);

    // 4. Update items order and check index sync
    items.value = [
      { id: 2, text: 'Banana' },
      { id: 1, text: 'Apple' },
    ];
    await $.nextTick();

    lastClickedItem = null;
    lastClickedIndex = -1;
    $container.find('li').eq(0).find('.btn').trigger('click'); // Now points to Banana
    expect(lastClickedItem).toEqual({ id: 2, text: 'Banana' });
    expect(lastClickedIndex).toBe(0); // Index updated to 0

    $container.remove();
  });

  it('should prevent DOMPurify stripping by using template tags for batch sanitization', async () => {
    const items = $.atom([1, 2, 3]);
    const $container = $('<ul>').appendTo(document.body);

    $container.atomList(items, {
      key: (item) => item,
      render: (item) => `<li><!-- comment -->Item ${item}</li>`,
    });

    await $.nextTick();
    expect($container.children().length).toBe(3);
    expect($container.children().eq(1).text()).toBe('Item 2');

    $container.remove();
  });

  it('should execute lifecycle hooks (bind, update, onRemove) with correct DOM attachment context', async () => {
    const items = $.atom<{ id: number; touch?: boolean }[]>([{ id: 1 }, { id: 2 }]);
    const $container = $('<div>').appendTo(document.body);
    let bindParentCount = 0;
    let updateParentCount = 0;
    let removeCalled = false;

    $container.atomList(items, {
      key: 'id',
      render: (item) => `<span id="item-${item.id}"></span>`,
      bind: ($el) => {
        // Element must be attached to the container at bind time!
        if ($el.parent()[0] === $container[0]) bindParentCount++;
      },
      update: ($el) => {
        if ($el.parent()[0] === $container[0]) updateParentCount++;
      },
      onRemove: async ($el) => {
        removeCalled = true;
        // Element must still be attached during async removal start
        expect($el.parent()[0]).toBe($container[0]);
        await new Promise((r) => setTimeout(r, 10));
      },
    });

    await $.nextTick();
    expect(bindParentCount).toBe(2);
    expect($container.children().length).toBe(2);

    items.value = [{ id: 1 }, { id: 2, touch: true }];
    await $.nextTick();
    expect(updateParentCount).toBe(2);

    items.value = [];
    await $.nextTick();
    expect(removeCalled).toBe(true);

    await new Promise((r) => setTimeout(r, 20));
    expect($container.children().length).toBe(0);

    $container.remove();
  });

  it('should clean up previous instance when atomList is called multiple times on the same element', async () => {
    const list1 = $.atom([1, 2]);
    const list2 = $.atom(['A', 'B']);
    const $container = $('<ul>').appendTo(document.body);

    let render1Count = 0;

    $container.atomList(list1, {
      key: (i) => i,
      render: (i) => {
        render1Count++;
        return `<li>${i}</li>`;
      },
    });

    await $.nextTick();
    expect(render1Count).toBe(2);

    // Second atomList call on the same container
    $container.atomList(list2, {
      key: (i) => i,
      render: (i) => `<li>${i}</li>`,
    });

    await $.nextTick();
    expect($container.children().length).toBe(2);
    expect($container.children().eq(0).text()).toBe('A');

    // Mutate the first list. The first effect should be disposed,
    // so its render function should NOT be called again.
    render1Count = 0;
    list1.value = [1, 2, 3];
    await $.nextTick();

    expect(render1Count).toBe(0); // Proof that the old effect was disposed

    $container.remove();
  });
});
