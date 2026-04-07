import $ from 'jquery';
import { LOG_PREFIXES } from '@/constants';
import type { ListOptions } from '@/types';
import { debug } from '@/utils/debug';
import { sanitizeHtml } from '@/utils/sanitize';
import type { ListContext } from './context';
import type { PlaceCallbacks, PreparedDiff } from './types';
import { cleanupNodes, setAtomKey, wrap } from './utils';

let listBatchIdCounter = 0;

/**
 * Helper to insert an element or a jQuery collection before a specific node.
 * Handles both single DOM elements and multi-root jQuery collections.
 *
 * @param elOrJq - The element(s) to insert.
 * @param nextNode - The reference node to insert before.
 * @param container - The parent container.
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
  const len = elOrJq.length;
  for (let i = 0; i < len; i++) {
    const el = elOrJq[i];
    if (el) {
      container.insertBefore(el, nextNode);
    }
  }
}

/**
 * Handles the logic when the list becomes empty.
 * Manages the removal of old items and the display of the 'empty' placeholder.
 *
 * @param ctx - The list context.
 * @param itemCount - Current number of items.
 * @param $container - The jQuery container.
 * @param empty - The empty state configuration.
 * @param arrayPool - Resource pool for releasing arrays.
 */
export function handleEmpty<T>(
  ctx: ListContext<T>,
  itemCount: number,
  $container: JQuery,
  empty: ListOptions<T>['empty'],
  arrayPool: { release: (arr: unknown[]) => void }
): void {
  if (ctx.$emptyEl && itemCount > 0) {
    ctx.$emptyEl.remove();
    ctx.$emptyEl = null;
  }
  if (itemCount !== 0) return;

  const { oldKeys, oldNodes, onRemove } = ctx;
  if (!onRemove) {
    for (let i = 0, len = oldKeys.length; i < len; i++) ctx.removingKeys.delete(oldKeys[i]!);
    $container.empty();
  } else {
    for (let i = 0, len = oldKeys.length; i < len; i++) {
      const k = oldKeys[i]!;
      if (oldNodes[i]) ctx.removeItem(k, wrap(oldNodes[i] as Element | JQuery<Element>));
    }
  }

  if (empty && !ctx.$emptyEl) {
    ctx.$emptyEl = (typeof empty === 'string'
      ? $(sanitizeHtml(empty))
      : $(empty as Element | JQuery)) as unknown as JQuery;
    ctx.$emptyEl.appendTo($container);
  }

  arrayPool.release(ctx.oldKeys);
  arrayPool.release(ctx.oldItems);
  arrayPool.release(ctx.oldNodes as unknown[]);
  ctx.oldKeys = [];
  ctx.oldItems = [];
  ctx.oldNodes = [];
}

/**
 * Renders the items that need creation or replacement.
 * Implements batch sanitization and optionally 'initial' optimization using innerHTML.
 *
 * @param diff - The prepared diff.
 * @param options - The list options.
 * @param isInitial - Whether this is the very first render of the list.
 * @returns An array of sanitized HTML strings if initial optimization is possible, null otherwise.
 */
export function renderItems<T>(
  diff: PreparedDiff<T>,
  options: ListOptions<T>,
  isInitial: boolean
): string[] | null {
  const { trKeys, trItems, trIdxs, newNodes, newStates } = diff;
  const renderCount = trKeys.length;
  const renderResults: (string | Element | DocumentFragment | JQuery)[] = new Array(renderCount);
  const htmlParts: string[] = [];
  let stringCount = 0;

  for (let t = 0; t < renderCount; t++) {
    const raw = options.render(trItems[t]!, trIdxs[t]!);
    renderResults[t] = raw;
    if (typeof raw === 'string') {
      htmlParts.push(raw);
      stringCount++;
    }
  }

  let sanitized: string[] | null = null;
  if (htmlParts.length > 0) {
    if (htmlParts.length === 1) sanitized = [sanitizeHtml(htmlParts[0]!)];
    else {
      const sep = `<template data-atom-sep="${(listBatchIdCounter++).toString(36)}"></template>`;
      sanitized = sanitizeHtml(htmlParts.join(sep)).split(sep);
    }
  }

  if (
    isInitial &&
    sanitized &&
    stringCount === renderCount &&
    !options.bind &&
    !options.onAdd &&
    !options.onRemove &&
    !options.events
  ) {
    // ensure each rendered string results in a single node
    if ($.parseHTML(sanitized.join('')).length === renderCount) {
      return sanitized;
    }
  }

  let fragIdx = 0;
  for (let t = 0; t < renderCount; t++) {
    const raw = renderResults[t]!;
    const $el = (typeof raw === 'string'
      ? $($.parseHTML(sanitized![fragIdx++]!))
      : $(raw as Element | DocumentFragment | JQuery)) as unknown as JQuery;
    const targetIdx = trIdxs[t]!,
      keyStr = String(trKeys[t]!);

    setAtomKey($el, keyStr);

    if (newStates[targetIdx] === 2 && newNodes[targetIdx]) {
      const node = newNodes[targetIdx]!;
      cleanupNodes(node as Element | JQuery);
      const $old = wrap(node as Element | JQuery<Element>);
      $old.first().before($el);
      $old.remove();
    }
    newNodes[targetIdx] = $el.length === 1 ? ($el[0] as Element) : $el;
  }
  return null;
}

/**
 * Identifies and removes items that are no longer present in the list.
 */
export function cleanupRemoved<T>(ctx: ListContext<T>, diff: PreparedDiff<T>): void {
  const { startIndex, oldEndIndex, newKeySet } = diff;
  for (let i = startIndex; i <= oldEndIndex; i++) {
    const k = ctx.oldKeys[i]!;
    // If key not in new set and node exists, trigger removal
    if (!newKeySet.has(k) && ctx.oldNodes[i])
      ctx.removeItem(k, wrap(ctx.oldNodes[i] as Element | JQuery<Element>));
  }
}

/**
 * Places the rendered/updated items into the DOM.
 * Optimizes for both the 'all-new' case and the 'incremental update' case.
 *
 * @param ctx - The list context.
 * @param diff - The prepared diff.
 * @param rawContainer - The raw DOM container element.
 * @param callbacks - Lifecycle hooks.
 * @param innerHtmlFragments - Optional pre-rendered HTML fragments for innerHTML optimization.
 */
export function placeItems<T>(
  ctx: ListContext<T>,
  diff: PreparedDiff<T>,
  rawContainer: Element,
  callbacks: PlaceCallbacks<T>,
  innerHtmlFragments: string[] | null
): void {
  const { newKeys, newItems, newNodes, newStates, newIndices } = diff;
  const itemCount = newKeys.length;

  if (innerHtmlFragments !== null) {
    // Fast-path: If rendering the whole list for the first time and no hooks are needed,
    // we can use innerHTML for maximum performance.
    rawContainer.innerHTML = innerHtmlFragments.join('');
    let el = rawContainer.firstElementChild;
    for (let i = 0; i < itemCount; i++) {
      if (!el) break;
      el.setAttribute('data-atom-key', String(newKeys[i]));
      newNodes[i] = el;
      newStates[i] = 0;
      ctx.removingKeys.delete(newKeys[i]!);
      debug.domUpdated(LOG_PREFIXES.LIST, $(el) as unknown as JQuery, 'list.add', newItems[i]);
      el = el.nextElementSibling;
    }
    return;
  }

  if (ctx.oldKeys.length === 0 && ctx.removingKeys.size === 0) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < itemCount; i++) {
      const node = newNodes[i];
      if (!node) continue;
      if (node instanceof Element) frag.appendChild(node);
      else for (let j = 0; j < (node as JQuery).length; j++) frag.appendChild((node as JQuery)[j]!);
    }
    rawContainer.innerHTML = '';
    rawContainer.appendChild(frag);
  } else {
    let nextNode: Node | null = null,
      min = 2147483647;
    for (let i = itemCount - 1; i >= 0; i--) {
      const idx = newIndices[i]!;
      const node = newNodes[i];
      if (!node) continue;

      if (idx !== -1 && idx < min) {
        min = idx;
      } else {
        insertOrAppend(node as Element | JQuery, nextNode, rawContainer);
      }
      nextNode = node instanceof Element ? node : ((node as JQuery)[0] ?? null);
    }
  }

  for (let i = 0; i < itemCount; i++) {
    const state = newStates[i]!;
    if (state !== 3) {
      const node = newNodes[i];
      if (!node) continue;
      const $el = wrap(node as Element | JQuery<Element>),
        item = newItems[i]!;
      if (state === 0) callbacks.update?.($el, item, i);
      else callbacks.bind?.($el, item, i);
      if (state === 1) {
        callbacks.onAdd?.($el);
        ctx.removingKeys.delete(newKeys[i]!);
        debug.domUpdated(LOG_PREFIXES.LIST, $el, 'list.add', item);
      }
    }
  }
}
