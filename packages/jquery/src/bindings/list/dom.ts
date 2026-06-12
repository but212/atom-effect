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
import { type ListContext, removeNode } from './context';
import { ItemState, type PlaceCallbacks, type PreparedDiff } from './types';
import { cleanupNodes } from './utils';

/**
 * Helper to inject data-atom-key attribute directly into an HTML string's root element.
 * Performance: Avoids setAttribute DOM calls inside placeItems.
 */
function injectKeyToHtml(html: string, key: string): string {
  const match = html.match(/^<([a-zA-Z0-9-]+)/);
  if (match) {
    const insertIdx = match[0].length;
    return `${html.slice(0, insertIdx)} data-atom-key="${key}"${html.slice(insertIdx)}`;
  }
  return html;
}

/**
 * Extracts raw Nodes from a render result.
 * Performance: Bypasses jQuery wrapper allocation.
 */
function getElements(raw: unknown): Node[] {
  if (typeof raw === 'string') {
    return $.parseHTML(raw) || [];
  }
  if (raw instanceof $) {
    return (raw as JQuery).get();
  }
  if (raw instanceof DocumentFragment) {
    return Array.from(raw.childNodes);
  }
  if (raw instanceof Node) {
    return [raw];
  }
  return [];
}

/**
 * Optimization: Zero-allocation
 * Inserts elements before a reference node while avoiding unnecessary array
 * allocations for jQuery collections.
 */
export function insertOrAppend(
  nodes: Node[] | undefined,
  nextNode: Node | null,
  container: Element
): void {
  if (!nodes) return;
  for (let i = 0; i < nodes.length; i++) {
    const element = nodes[i];
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
      if (row.node) removeNode(ctx, row.key, row.node);
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
    ? results.map((r, i) => {
        const slot = toRender[i];
        const val = typeof r === 'string' ? sanitizeHtml(r) : r;
        if (typeof val === 'string' && slot !== undefined) {
          return injectKeyToHtml(val, String(slot.key));
        }
        return val;
      })
    : results;

  const isAllStrings = results.every((r) => typeof r === 'string');
  if (isInitial && isAllStrings && !options.events) {
    const allNodes = $.parseHTML(sanitized.join(''));
    if (allNodes && allNodes.length === renderCount && allNodes.every((n) => n.nodeType === 1)) {
      return sanitized as string[];
    }
  }

  for (let i = 0; i < renderCount; i++) {
    const slot = toRender[i];
    const raw = sanitized[i];
    if (!slot || raw === undefined) continue;

    const nodes = getElements(raw);

    // Fallback: Ensure data-atom-key is set on all Element nodes
    for (const el of nodes) {
      if (el.nodeType === 1) {
        const element = el as HTMLElement;
        if (!element.hasAttribute('data-atom-key')) {
          element.setAttribute('data-atom-key', String(slot.key));
        }
      }
    }

    const oldNode = slot.node;
    if (slot.state === ItemState.ForceReplace && oldNode) {
      cleanupNodes(oldNode);
      const firstOld = oldNode[0];
      if (firstOld?.parentNode) {
        const parent = firstOld.parentNode;
        for (let j = 0; j < nodes.length; j++) {
          const el = nodes[j];
          if (el) parent.insertBefore(el, firstOld);
        }
        for (let j = 0; j < oldNode.length; j++) {
          const el = oldNode[j];
          if (el?.parentNode) {
            el.parentNode.removeChild(el);
          }
        }
      }
    }

    slot.node = nodes;
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
      removeNode(ctx, row.key, row.node);
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

      // Lazy wrapping: JQuery wrapper only allocated if callback exists
      const $el = bind || onAdd ? $(el as HTMLElement) : null;
      slot.node = [el as HTMLElement];
      slot.state = ItemState.Existing;

      if (bind && $el) bind($el, item, i);
      if (onAdd && $el) {
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
      if (slot?.node) {
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

    if (bind || onAdd || (state === ItemState.Existing && update)) {
      const $node = $(node as HTMLElement[]);
      switch (state) {
        case ItemState.Existing:
          if (update) update($node, item, i);
          break;
        case ItemState.New:
          if (bind) bind($node, item, i);
          if (onAdd) {
            onAdd($node);
            ctx.removingKeys.delete(key);
            debug.domUpdated(SYSTEM_LIST.PREFIX, $node, 'list.add', item);
          }
          break;
        case ItemState.ForceReplace:
          if (bind) bind($node, item, i);
          break;
      }
    }
  }
}
