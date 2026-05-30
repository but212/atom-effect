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
import { sanitizeCache, sanitizeHtml } from '@/utils/sanitize';
import type { ListContext } from './context';
import { ItemState, type PlaceCallbacks, type PreparedDiff } from './types';
import { cleanupNodes, setAtomKey } from './utils';

/**
 * Optimization: Zero-allocation
 * Inserts elements before a reference node while avoiding unnecessary array
 * allocations for jQuery collections.
 *
 * Why:
 * Directly iterates over JQuery objects to avoid `.get()` or `Array.from()`.
 */
export function insertOrAppend(
  $el: JQuery | undefined,
  nextNode: Node | null,
  container: Element
): void {
  if (!$el) return;

  for (let i = 0, len = $el.length; i < len; i++) {
    const el = $el[i];
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
        ctx.remove(row.key, row.node);
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
      cleanupNodes(oldNode);
      oldNode.first().before($el);
      oldNode.remove();
    }

    slot.node = $el;
  }

  return null;
}

/**
 * Optimization: Zero-allocation string hashing.
 * Computes a 32-bit polynomial rolling hash over an array of strings.
 */
function computeHash(strings: string[], salt = 0): number {
  let hash = salt;
  const len = strings.length;
  for (let i = 0; i < len; i++) {
    const s = strings[i]!;
    const sLen = s.length;
    for (let j = 0; j < sLen; j++) {
      hash = (hash * 31 + s.charCodeAt(j)) | 0;
    }
  }
  return hash;
}

/**
 * Generates a unique, safe, and deterministic sentinel template separator.
 * Performs collision checking and resolves potential collisions iteratively.
 */
function getSafeSeparator(parts: string[]): string {
  let hash = computeHash(parts);
  let attempts = 0;
  while (attempts < 10) {
    const sepId = Math.abs(hash).toString(36);
    const sep = `<template data-atom-sep="s${sepId}"></template>`;

    let hasCollision = false;
    const len = parts.length;
    for (let i = 0; i < len; i++) {
      if (parts[i]!.includes(sep)) {
        hasCollision = true;
        break;
      }
    }

    if (!hasCollision) return sep;

    attempts++;
    hash = computeHash(parts, attempts);
  }

  // Extreme fallback (mathematically highly improbable)
  return `<template data-atom-sep="s${Math.random().toString(36).slice(2)}"></template>`;
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
  const len = parts.length;
  const result = new Array(len);
  let allCached = true;
  for (let i = 0; i < len; i++) {
    const part = parts[i]!;
    const cached = sanitizeCache.get(part);
    if (cached !== undefined) {
      result[i] = cached;
    } else {
      allCached = false;
      break;
    }
  }
  if (allCached) return result;

  if (len === 1) {
    const sanitized = sanitizeHtml(parts[0]!);
    return [sanitized];
  }
  const sep = getSafeSeparator(parts);
  const sanitizedList = sanitizeHtml(parts.join(sep)).split(sep);
  for (let i = 0; i < len; i++) {
    const part = parts[i]!;
    const sanitized = sanitizedList[i]!;
    sanitizeCache.set(part, sanitized);
  }
  return sanitizedList;
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
      ctx.remove(row.key, row.node);
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
        slot.node = $(el) as unknown as JQuery;
        slot.state = ItemState.Existing;
        el = el.nextElementSibling;
      }
    } else {
      for (let i = 0; i < count; i++) {
        if (!el) break;
        const slot = slots[i]!;
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
    }
    return;
  }

  // Fast-path: Initial render without HTML fragments
  if (ctx.snapshots.length === 0 && ctx.removingKeys.size === 0) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const $node = slots[i]!.node;
      if (!$node) continue;
      for (let j = 0, jLen = $node.length; j < jLen; j++) {
        const entry = $node[j];
        if (entry) frag.appendChild(entry);
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
    const slot = slots[i]!;
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
