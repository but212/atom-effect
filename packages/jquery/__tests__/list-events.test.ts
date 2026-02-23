import $ from 'jquery';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simulate a click on `el`, bubbling up through jQuery's event system. */
function click(el: HTMLElement): void {
  $(el).trigger('click');
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('atomList – events delegation', () => {
  let $container: JQuery;

  beforeEach(() => {
    $container = $('<ul>').appendTo(document.body);
  });

  afterEach(() => {
    $container.remove();
  });

  // -------------------------------------------------------------------------
  // 1. Basic delegation with child selector
  // -------------------------------------------------------------------------

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
  });

  // -------------------------------------------------------------------------
  // 2. Delegation without child selector (item root click)
  // -------------------------------------------------------------------------

  it('calls handler when item root element is clicked (no selector)', async () => {
    const items = $.atom([{ id: 10 }, { id: 20 }]);
    const handler = vi.fn();

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
  });

  // -------------------------------------------------------------------------
  // 3. All items reachable via a single delegated listener
  // -------------------------------------------------------------------------

  it('fires handler for every item in the list via a single delegated listener', async () => {
    const items = $.atom([1, 2, 3, 4, 5].map((id) => ({ id })));
    const handler = vi.fn();

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
  });

  // -------------------------------------------------------------------------
  // 4. Removed items do not fire the handler
  // -------------------------------------------------------------------------

  it('does not call handler for items that have been removed from the list', async () => {
    const items = $.atom([{ id: 1 }, { id: 2 }]);
    const handler = vi.fn();

    $container.atomList(items, {
      key: 'id',
      render: (item) => `<li data-id="${item.id}"></li>`,
      events: { click: handler },
    });

    await $.nextTick();

    // Capture the DOM node of item id=1 before removal.
    const $removedLi = $container.find('[data-id="1"]');

    // Remove item id=1 from the list.
    items.value = [{ id: 2 }];
    await $.nextTick();

    // Manually trigger click on the now-detached node.
    // The handler must NOT be called because the node is no longer in itemMap.
    click($removedLi[0]!);

    expect(handler).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Event listener is removed when container is cleaned up
  // -------------------------------------------------------------------------

  it('removes the delegated listener when the container element is unbound', async () => {
    const items = $.atom([{ id: 1 }]);
    const handler = vi.fn();

    $container.atomList(items, {
      key: 'id',
      render: () => `<li><button class="btn">go</button></li>`,
      events: { 'click .btn': handler },
    });

    await $.nextTick();

    // Verify it fires before cleanup.
    click($container.find('.btn')[0]!);
    expect(handler).toHaveBeenCalledTimes(1);

    // Unbind all reactive bindings on the container.
    $container.atomUnbind();

    // Click again — should be silent.
    handler.mockClear();
    click($container.find('.btn')[0]!);
    expect(handler).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. index reflects current order after reorder
  // -------------------------------------------------------------------------

  it('reports the current list index after items are reordered', async () => {
    const items = $.atom([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const handler = vi.fn();

    $container.atomList(items, {
      key: 'id',
      render: (item) => `<li data-id="${item.id}"></li>`,
      events: { click: handler },
    });

    await $.nextTick();

    // Reverse order: [3, 2, 1]
    items.value = [{ id: 3 }, { id: 2 }, { id: 1 }];
    await $.nextTick();

    // Click item id=1, which is now at index 2.
    click($container.find('[data-id="1"]')[0]!);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]).toEqual({ id: 1 });
    expect(handler.mock.calls[0]![1]).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 7. Multiple event types each get their own single listener
  // -------------------------------------------------------------------------

  it('supports multiple event types simultaneously', async () => {
    const items = $.atom([{ id: 1 }]);
    const clickHandler = vi.fn();
    const dblClickHandler = vi.fn();

    $container.atomList(items, {
      key: 'id',
      render: () => `<li></li>`,
      events: {
        click: clickHandler,
        dblclick: dblClickHandler,
      },
    });

    await $.nextTick();

    const $li = $container.find('li').eq(0);
    click($li[0]!);
    $li.trigger('dblclick');

    expect(clickHandler).toHaveBeenCalledTimes(1);
    expect(dblClickHandler).toHaveBeenCalledTimes(1);
    expect(clickHandler.mock.calls[0]![0]).toEqual({ id: 1 });
    expect(dblClickHandler.mock.calls[0]![0]).toEqual({ id: 1 });
  });

  // -------------------------------------------------------------------------
  // 8. childSelector must not escape outside the item root
  // -------------------------------------------------------------------------

  it('does not fire when closest() matches an ancestor outside the item root', async () => {
    // Wrap the container in a parent that has the same class as the child selector.
    // target.closest('.btn') would escape upward and find this outer element
    // if we do not guard with node.contains(matched).
    const $outer = $('<div class="btn">').appendTo(document.body);
    $container.appendTo($outer);

    const items = $.atom([{ id: 1 }]);
    const handler = vi.fn();

    $container.atomList(items, {
      key: 'id',
      // Item has NO .btn inside — only plain text.
      render: () => `<li>text</li>`,
      events: { 'click .btn': handler },
    });

    await $.nextTick();

    // Click the plain text inside <li>. closest('.btn') will find $outer,
    // but $outer is not a descendant of the item root <li>.
    click($container.find('li')[0]!);

    expect(handler).not.toHaveBeenCalled();

    $outer.remove();
  });
});
