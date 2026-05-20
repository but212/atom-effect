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
import { cleanupNodes, setAtomKey, wrap } from './utils';

/**
 * Optimization: Zero-allocation
 * Inserts elements before a reference node while avoiding unnecessary array
 * allocations for jQuery collections.
 *
 * Why:
 * Directly iterates over JQuery objects to avoid `.get()` or `Array.from()`.
 */
export function insertOrAppend(
  elOrJq: Element | JQuery | undefined,
  nextNode: Node | null,
  container: Element
): void {
  if (!elOrJq) return;

  if (elOrJq instanceof Element) {
    container.insertBefore(elOrJq, nextNode);
    return;
  }

  for (let i = 0, len = elOrJq.length; i < len; i++) {
    const el = elOrJq[i];
    if (el) container.insertBefore(el, nextNode);
  }
}

/**
 * Logic: State Transition
 * Resets the container or renders an empty placeholder.
 *
 * Why:
 * Decouples destructive cleanup from animated cleanup, ensuring the context
 * is cleared only after the DOM reflects the empty state.
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

  // Reason: Use destructive empty for speed if no exit animations are required.
  if (!onRemove) {
    $container.empty();
  } else {
    const len = snapshots.length;
    for (let i = 0; i < len; i++) {
      const row = snapshots[i]!;
      if (row.node) {
        ctx.remove(row.key, wrap(row.node as Element | JQuery<Element>));
      }
    }
  }

  if (empty && !ctx.$emptyEl) {
    const raw = typeof empty === 'string' ? $.parseHTML(sanitizeHtml(empty)) : empty;
    ctx.$emptyEl = $(raw as Element | Element[] | JQuery) as unknown as JQuery;
    ctx.$emptyEl.appendTo($container);
  }

  ctx.keyToIndex.clear();
  ctx.snapshots = [];
}

/**
 * Role: Template Processor
 * Transforms data items into DOM nodes or sanitized HTML strings.
 *
 * Optimization: Cold Start
 * Returns raw HTML strings for initial render to allow direct `innerHTML`
 * injection, bypassing jQuery construction overhead.
 *
 * Security: XSS Prevention
 * Batches string parsing via `batchSanitize` to apply consistent sanitization
 * across all render fragments.
 */
export function renderItems<T>(
  diff: PreparedDiff<T>,
  options: ListOptions<T>,
  isInitial: boolean
): string[] | null {
  const { toRender } = diff;
  const renderCount = toRender.length;
  if (renderCount === 0) return null;

  const results = new Array(renderCount);
  const htmlParts: string[] = [];
  let isAllStrings = true;

  for (let i = 0; i < renderCount; i++) {
    const entry = toRender[i]!;
    const res = options.render(entry.item, entry.targetIndex);
    results[i] = res;

    if (typeof res === 'string') {
      htmlParts.push(res);
    } else {
      isAllStrings = false;
    }
  }

  let sanitized: string[] | null = null;
  if (htmlParts.length > 0) sanitized = batchSanitize(htmlParts);

  let bulkNodes: Node[] | null = null;
  if (isAllStrings && sanitized) {
    const allNodes = $.parseHTML(sanitized.join(''));
    if (allNodes && allNodes.length === renderCount) {
      let allElements = true;
      for (let i = 0; i < renderCount; i++) {
        if (allNodes[i]!.nodeType !== 1) {
          allElements = false;
          break;
        }
      }
      if (allElements) {
        if (isInitial && !options.events) return sanitized;
        bulkNodes = allNodes;
      }
    }
  }

  let sIdx = 0;
  for (let i = 0; i < renderCount; i++) {
    const slot = toRender[i]!;
    const raw = results[i]!;

    let $el: JQuery;
    if (bulkNodes) {
      $el = $(bulkNodes[i] as Element) as unknown as JQuery;
    } else {
      const html = typeof raw === 'string' ? sanitized![sIdx++]! : raw;
      $el = $(
        (typeof html === 'string' ? $.parseHTML(html) : html) as Element | DocumentFragment | JQuery
      ) as unknown as JQuery;
    }

    setAtomKey($el, String(slot.key));

    const oldNode = slot.node;
    if (slot.state === ItemState.ForceReplace && oldNode) {
      cleanupNodes(oldNode as Element | JQuery);
      const $old = wrap(oldNode as Element | JQuery<Element>);
      $old.first().before($el);
      $old.remove();
    }

    slot.node = $el.length === 1 ? ($el[0] as Element) : $el;
  }

  return null;
}

/**
 * Optimization: Batched Sanitization
 * Sanitizes multiple fragments in a single pass using a sentinel separator.
 *
 * Security: XSS Prevention
 * Reduces the fixed overhead of the sanitizer while maintaining high safety
 * for many small fragments.
 */
function batchSanitize(parts: string[]): string[] {
  if (parts.length === 1) return [sanitizeHtml(parts[0]!)];
  let hash = 0;
  const len = parts.length;
  for (let i = 0; i < len; i++) {
    const s = parts[i]!;
    const sLen = s.length;
    for (let j = 0; j < sLen; j++) {
      hash = (hash * 31 + s.charCodeAt(j)) | 0;
    }
  }
  let sepId = Math.abs(hash).toString(36);
  let sep = `<template data-atom-sep="s${sepId}"></template>`;

  let collision = true;
  let attempts = 0;
  while (collision && attempts < 10) {
    collision = false;
    for (let i = 0; i < len; i++) {
      if (parts[i]!.includes(sep)) {
        collision = true;
        break;
      }
    }
    if (collision) {
      attempts++;
      hash = (hash * 31 + attempts) | 0;
      sepId = Math.abs(hash).toString(36);
      sep = `<template data-atom-sep="s${sepId}"></template>`;
    }
  }

  return sanitizeHtml(parts.join(sep)).split(sep);
}

/**
 * Logic: Removal Trigger
 * Executes the removal lifecycle for items missing in the new data set.
 */
export function cleanupRemoved<T>(ctx: ListContext<T>): void {
  const { snapshots, keyToIndex } = ctx;
  for (let i = 0, len = snapshots.length; i < len; i++) {
    const row = snapshots[i]!;
    if (row.node && !keyToIndex.has(row.key)) {
      ctx.remove(row.key, wrap(row.node as Element | JQuery<Element>));
    }
  }
}

/**
 * Logic: Dual-path Synchronization
 * Positions items in the DOM and executes lifecycle callbacks.
 *
 * Optimization: Reverse Loop
 * Uses a reverse iteration for reconciliation to maintain DOM order with
 * minimal moves.
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

    if (!bind && !onAdd) {
      for (let i = 0; i < count; i++) {
        if (!el) break;
        const slot = slots[i]!;
        el.setAttribute('data-atom-key', String(slot.key));
        slot.node = el;
        slot.state = ItemState.Existing;
        el = el.nextElementSibling;
      }
    } else {
      for (let i = 0; i < count; i++) {
        if (!el) break;
        const slot = slots[i]!;
        const { key, item } = slot;

        el.setAttribute('data-atom-key', String(key));
        slot.node = el;
        slot.state = ItemState.Existing;

        const $el = $(el) as unknown as JQuery;
        if (bind) bind($el, item, i);
        if (onAdd) {
          onAdd($el);
          ctx.removingKeys.delete(key);
          debug.domUpdated(SYSTEM_LIST.PREFIX, $el, 'list.add', item);
        }
        el = el.nextElementSibling;
      }
    }
    return;
  }

  // Fast-path: Initial render without HTML fragments
  if (ctx.snapshots.length === 0 && ctx.removingKeys.size === 0) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const node = slots[i]!.node;
      if (!node) continue;
      if (node instanceof Element) {
        frag.appendChild(node);
      } else {
        for (let j = 0, jLen = node.length; j < jLen; j++) {
          const entry = node[j];
          if (entry) frag.appendChild(entry);
        }
      }
    }
    container.innerHTML = '';
    container.appendChild(frag);
  } else {
    // Reconciliation path: Minimal moves using reverse-order insertion
    let next: Node | null = null;
    let min = Infinity;
    for (let i = count - 1; i >= 0; i--) {
      const slot = slots[i]!;
      const idx = slot.oldIndex;
      const node = slot.node;
      if (!node) continue;

      const first = node instanceof Element ? node : node[0];
      if (first) {
        if (idx !== -1 && idx < min) {
          min = idx;
        } else {
          insertOrAppend(node as Element | JQuery, next, container);
        }
        next = first;
      }
    }
  }

  const { onAdd, bind, update } = callbacks;

  for (let i = 0; i < count; i++) {
    const slot = slots[i]!;
    const { state, node, item, key } = slot;
    if (state === ItemState.Unchanged || !node) continue;

    switch (state) {
      case ItemState.Existing:
        if (update) update(wrap(node as Element | JQuery<Element>), item, i);
        break;
      case ItemState.New: {
        const $el = wrap(node as Element | JQuery<Element>);
        if (bind) bind($el, item, i);
        if (onAdd) {
          onAdd($el);
          ctx.removingKeys.delete(key);
          debug.domUpdated(SYSTEM_LIST.PREFIX, $el, 'list.add', item);
        }
        break;
      }
      case ItemState.ForceReplace:
        if (bind) bind(wrap(node as Element | JQuery<Element>), item, i);
        break;
    }
  }
}
