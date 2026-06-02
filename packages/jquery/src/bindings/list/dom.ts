/**
 * @module List DOM Orchestrator
 *
 * Responsibility:
 * Orchestrates the physical DOM mutations, sanitization, and lifecycle callback
 * execution for the reactive list binding.
 *
 * Design Intent:
 * Minimizes DOM churn and memory pressure by combining "Cold Start" HTML string
 * injection with a multi-pass reconciliation algorithm for updates.
 */

import $ from 'jquery';
import { SYSTEM_LIST } from '@/constants';
import type { ListOptions } from '@/types';
import { debug } from '@/utils/debug';
import { sanitizeHtml } from '@/utils/sanitize';
import type { ListContext } from './context';
import { ItemState, type PlaceCallbacks, type PreparedDiff } from './types';
import { cleanupNodes, setAtomKey } from './utils';

/**
 * Optimization: Zero-allocation
 * Inserts elements before a reference node while avoiding unnecessary array
 * allocations for jQuery collections.
 */
export function insertOrAppend(
  $el: JQuery | undefined,
  nextNode: Node | null,
  container: Element
): void {
  if (!$el) return;
  for (let i = 0; i < $el.length; i++) {
    const element = $el[i];
    if (element) container.insertBefore(element, nextNode);
  }
}

/**
 * Logic: State Transition
 * Resets the container or renders an empty placeholder.
 */
export function handleEmpty<T>(
  ctx: ListContext<T>,
  itemCount: number,
  $container: JQuery,
  empty: ListOptions<T>['empty']
): void {
  if (ctx.$emptyEl && itemCount > 0) {
    ctx.$emptyEl.remove();
    ctx.$emptyEl = null;
  }
  if (itemCount !== 0) return;

  const { onRemove, snapshots } = ctx;

  if (onRemove) {
    for (const row of snapshots) {
      if (row.node) ctx.remove(row.key, row.node);
    }
  } else {
    $container.empty();
  }

  if (empty && !ctx.$emptyEl) {
    const raw = typeof empty === 'string' ? $.parseHTML(sanitizeHtml(empty)) : empty;
    ctx.$emptyEl = ($(raw as Element | Element[] | JQuery) as unknown as JQuery).appendTo(
      $container
    ) as unknown as JQuery;
  }

  ctx.keyToIndex.clear();
  ctx.snapshots = [];
}

/**
 * Role: Template Processor
 * Transforms data items into DOM nodes or sanitized HTML strings.
 */
export function renderItems<T>(
  diff: PreparedDiff<T>,
  options: ListOptions<T>,
  isInitial: boolean
): string[] | null {
  const { toRender } = diff;
  const renderCount = toRender.length;
  if (renderCount === 0) return null;

  const results = toRender.map((entry) => options.render(entry.item, entry.targetIndex));

  const hasStrings = results.some((r) => typeof r === 'string');
  const sanitized = hasStrings
    ? results.map((r) => (typeof r === 'string' ? sanitizeHtml(r) : r))
    : results;

  const isAllStrings = results.every((r) => typeof r === 'string');
  if (isInitial && isAllStrings && !options.events) {
    const allNodes = $.parseHTML(sanitized.join(''));
    if (allNodes && allNodes.length === renderCount) {
      let allElements = true;
      for (let i = 0; i < renderCount; i++) {
        if (allNodes[i]?.nodeType !== 1) {
          allElements = false;
          break;
        }
      }
      if (allElements) {
        return sanitized as string[];
      }
    }
  }

  for (let i = 0; i < renderCount; i++) {
    const slot = toRender[i];
    const raw = sanitized[i];
    if (!slot || raw === undefined) continue;

    const $el = $(
      (typeof raw === 'string' ? $.parseHTML(raw) : raw) as Element | DocumentFragment | JQuery
    ) as unknown as JQuery;

    setAtomKey($el, String(slot.key));

    const oldNode = slot.node;
    if (slot.state === ItemState.ForceReplace && oldNode) {
      cleanupNodes(oldNode);
      oldNode.first().before($el);
      oldNode.remove();
    }

    slot.node = $el;
  }

  return null;
}

/**
 * Logic: Removal Trigger
 * Executes the removal lifecycle for items missing in the new data set.
 */
export function cleanupRemoved<T>(ctx: ListContext<T>): void {
  const { snapshots, keyToIndex } = ctx;
  for (let i = 0; i < snapshots.length; i++) {
    const row = snapshots[i];
    if (row?.node && !keyToIndex.has(row.key)) {
      ctx.remove(row.key, row.node);
    }
  }
}

/**
 * Logic: Dual-path Synchronization
 * Positions items in the DOM and executes lifecycle callbacks.
 */
export function placeItems<T>(
  ctx: ListContext<T>,
  diff: PreparedDiff<T>,
  container: Element,
  callbacks: PlaceCallbacks<T>,
  htmlFragments: string[] | null
): void {
  const { slots } = diff;
  const count = slots.length;

  if (htmlFragments) {
    container.innerHTML = htmlFragments.join('');
    let el = container.firstElementChild;
    const { bind, onAdd } = callbacks;

    for (let i = 0; i < count; i++) {
      if (!el) break;
      const slot = slots[i];
      if (!slot) continue;
      const { key, item } = slot;

      el.setAttribute('data-atom-key', String(key));
      const $el = $(el) as unknown as JQuery;
      slot.node = $el;
      slot.state = ItemState.Existing;

      if (bind) bind($el, item, i);
      if (onAdd) {
        onAdd($el);
        ctx.removingKeys.delete(key);
        debug.domUpdated(SYSTEM_LIST.PREFIX, $el, 'list.add', item);
      }
      el = el.nextElementSibling;
    }
    return;
  }

  if (ctx.snapshots.length === 0 && ctx.removingKeys.size === 0) {
    const frag = document.createDocumentFragment();
    for (const slot of slots) {
      if (slot.node) {
        for (let j = 0; j < slot.node.length; j++) {
          const element = slot.node[j];
          if (element) frag.appendChild(element);
        }
      }
    }
    container.innerHTML = '';
    container.appendChild(frag);
  } else {
    let next: Node | null = null;
    let min = Infinity;
    for (let i = count - 1; i >= 0; i--) {
      const slot = slots[i];
      if (!slot) continue;
      const idx = slot.oldIndex;
      const node = slot.node;
      if (!node) continue;

      const first = node[0];
      if (first) {
        if (idx !== -1 && idx < min) {
          min = idx;
        } else {
          insertOrAppend(node, next, container);
        }
        next = first;
      }
    }
  }

  const { onAdd, bind, update } = callbacks;

  for (let i = 0; i < count; i++) {
    const slot = slots[i];
    if (!slot) continue;
    const { state, node, item, key } = slot;
    if (state === ItemState.Unchanged || !node) continue;

    switch (state) {
      case ItemState.Existing:
        if (update) update(node, item, i);
        break;
      case ItemState.New: {
        if (bind) bind(node, item, i);
        if (onAdd) {
          onAdd(node);
          ctx.removingKeys.delete(key);
          debug.domUpdated(SYSTEM_LIST.PREFIX, node, 'list.add', item);
        }
        break;
      }
      case ItemState.ForceReplace:
        if (bind) bind(node, item, i);
        break;
    }
  }
}
