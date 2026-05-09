import $ from 'jquery';
import { SYSTEM_LIST } from '@/constants';
import type { ListOptions } from '@/types';
import { debug } from '@/utils/debug';
import { sanitizeHtml } from '@/utils/sanitize';
import type { ListContext } from './context';
import { ItemState, type PlaceCallbacks, type PreparedDiff } from './types';
import { cleanupNodes, setAtomKey, wrap } from './utils';

/**
 * A low-level DOM utility for inserting elements before a specific reference node.
 *
 * This helper supports both raw `Element` instances and jQuery collections,
 * ensuring consistent insertion behavior regardless of the input type.
 *
 * @param elOrJq - The element or jQuery collection to insert.
 * @param nextNode - The reference node to insert before. If null, appends to the container.
 * @param container - The parent container element.
 * @internal
 */
export function insertOrAppend(
  elOrJq: Element | JQuery | undefined,
  nextNode: Node | null,
  container: Element
): void {
  if (!elOrJq) return;
  if (elOrJq instanceof Element) {
    container.insertBefore(elOrJq, nextNode);
  } else {
    for (let i = 0, len = elOrJq.length; i < len; i++) {
      const el = elOrJq[i];
      if (el) container.insertBefore(el, nextNode);
    }
  }
}

/**
 * Orchestrates the cleanup of a list container and the rendering of empty placeholders.
 *
 * Logic: If an `onRemove` callback is provided, the function performs asynchronous
 * removals for each item to allow for exit animations. Otherwise, it executes a
 * destructive `empty()` on the container for efficiency.
 *
 * When to use:
 * - To reset a list container during reconciliation or when the data source becomes empty.
 *
 * @param ctx - The list context containing historical state.
 * @param itemCount - The number of items in the new data set.
 * @param $container - The jQuery-wrapped container.
 * @param empty - The template or element to display when the list is empty.
 * @internal
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

  const { onRemove } = ctx;
  if (!onRemove) {
    $container.empty();
  } else {
    // Reason: Coordinated exit animations are triggered for every existing row
    // to maintain visual consistency during batch updates.
    ctx.oldKeys.forEach((k, i) => {
      const node = ctx.oldNodes[i];
      if (node) {
        ctx.removeItem(k, wrap(node as Element | JQuery<Element>));
      }
    });
  }

  if (empty && !ctx.$emptyEl) {
    const raw = typeof empty === 'string' ? $.parseHTML(sanitizeHtml(empty)) : empty;
    ctx.$emptyEl = $(raw as Element | Element[] | JQuery) as unknown as JQuery;
    ctx.$emptyEl.appendTo($container);
  }

  ctx.oldKeys = [];
  ctx.oldItems = [];
  ctx.oldNodes = [];
}

/**
 * Transforms items into DOM handles based on the reconciliation plan.
 *
 * Optimization: If all items utilize string templates and the list is undergoing
 * an initial render (cold start), the function returns sanitized HTML fragments
 * for direct `innerHTML` injection, bypassing the overhead of individual jQuery
 * object construction.
 *
 * When to use:
 * - Internal processing of new items within the `atomList` lifecycle.
 *
 * @param diff - The prepared diff plan.
 * @param options - Configuration options for the list.
 * @param isInitial - Indicates whether this is the first render of the list.
 * @returns An array of sanitized HTML strings if the fast-path is applicable; otherwise null.
 * @internal
 */
export function renderItems<T>(
  diff: PreparedDiff<T>,
  options: ListOptions<T>,
  isInitial: boolean
): string[] | null {
  const { toRender, newNodes, newStates } = diff;
  const renderCount = toRender.length;
  if (renderCount === 0) return null;

  const results = toRender.map((entry) => options.render(entry.item, entry.index));
  const htmlParts = results.filter((raw): raw is string => typeof raw === 'string');
  const isAllStrings = htmlParts.length === renderCount;

  let sanitized: string[] | null = null;
  if (htmlParts.length > 0) sanitized = batchSanitize(htmlParts);

  // Optimization: Fast-path for initial renders using string-only templates without custom bindings.
  if (
    isInitial &&
    isAllStrings &&
    sanitized &&
    !options.bind &&
    !options.onAdd &&
    !options.events
  ) {
    if ($.parseHTML(sanitized.join('')).length === renderCount) return sanitized;
  }

  let sIdx = 0;
  for (let i = 0, len = toRender.length; i < len; i++) {
    const entry = toRender[i]!;
    const { key, index: targetIdx } = entry;
    const raw = results[i]!;
    const $el = (typeof raw === 'string'
      ? $($.parseHTML(sanitized![sIdx++]!))
      : $(raw as Element | DocumentFragment | JQuery)) as unknown as JQuery;

    setAtomKey($el, String(key));

    if (newStates[targetIdx] === ItemState.ForceReplace && newNodes[targetIdx]) {
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
 * Sanitizes a batch of HTML strings in a single pass to improve performance.
 *
 * Reason: Reduces the overhead of the sanitization engine (e.g., DOMPurify)
 * by merging multiple fragments into a single string separated by unique sentinels.
 *
 * @param parts - An array of HTML strings to sanitize.
 * @returns An array of sanitized HTML strings.
 * @internal
 */
function batchSanitize(parts: string[]): string[] {
  if (parts.length === 1) return [sanitizeHtml(parts[0]!)];
  const sep = `<template data-atom-sep="s${Math.random().toString(36).slice(2)}"></template>`;

  return sanitizeHtml(parts.join(sep)).split(sep);
}

/**
 * Identifies and removes items that are no longer present in the reactive data set.
 *
 * Logic: Iterates through the historical key set and triggers the removal
 * lifecycle for any key that is not found in the new state.
 *
 * @param ctx - The list context containing historical state.
 * @param diff - The prepared diff plan.
 * @internal
 */
export function cleanupRemoved<T>(ctx: ListContext<T>, diff: PreparedDiff<T>): void {
  const { startIndex, oldEndIndex, newKeySet } = diff;
  for (let i = startIndex; i <= oldEndIndex; i++) {
    const k = ctx.oldKeys[i]!;
    // Note: Items within the head/tail optimization range are excluded.
    if (!newKeySet.has(k) && ctx.oldNodes[i]) {
      ctx.removeItem(k, wrap(ctx.oldNodes[i] as Element | JQuery<Element>));
    }
  }
}

/**
 * Strategically places item nodes into the DOM container based on the reconciliation plan.
 *
 * Logic: This function selects the most efficient injection path (innerHTML,
 * Fragment, or complex Moves) based on the current state of the container.
 *
 * Optimization: When performing moves, the loop iterates backwards to use
 * `insertBefore(nextNode)`, which is more efficient across most JS engines
 * than forward insertions.
 *
 * @param ctx - The list context.
 * @param diff - The prepared diff plan.
 * @param container - The parent DOM element.
 * @param callbacks - User-provided hooks for binding and updates.
 * @param htmlFragments - Optional pre-rendered HTML strings from the fast-path.
 * @internal
 */
const ACTION_TABLE: Record<number, (keyof PlaceCallbacks<unknown>)[]> = {
  [ItemState.Unchanged]: [],
  [ItemState.Existing]: ['update'],
  [ItemState.New]: ['bind', 'onAdd'],
  [ItemState.ForceReplace]: ['bind'],
};

export function placeItems<T>(
  ctx: ListContext<T>,
  diff: PreparedDiff<T>,
  container: Element,
  callbacks: PlaceCallbacks<T>,
  htmlFragments: string[] | null
): void {
  const { newKeys, newItems, newNodes, newStates, newIndices } = diff;
  const count = newKeys.length;

  if (htmlFragments) {
    container.innerHTML = htmlFragments.join('');
    let el = container.firstElementChild;
    newKeys.forEach((key, i) => {
      if (!el) return;
      const $el = $(el) as unknown as JQuery;
      el.setAttribute('data-atom-key', String(key));
      newNodes[i] = el;
      newStates[i] = ItemState.Existing;
      debug.domUpdated(SYSTEM_LIST.PREFIX, $el, 'list.add', newItems[i]);
      el = el.nextElementSibling;
    });
    return;
  }

  if (ctx.oldKeys.length === 0 && ctx.removingKeys.size === 0) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const node = newNodes[i];
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
    let next: Node | null = null;
    let min = Infinity;
    for (let i = count - 1; i >= 0; i--) {
      const idx = newIndices[i]!;
      const node = newNodes[i];
      if (!node) continue;

      const first = node instanceof Element ? node : (node as JQuery)[0];
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
    const state = newStates[i]!;
    const actions = ACTION_TABLE[state] ?? [];
    const node = newNodes[i];
    if (actions.length === 0 || !node) continue;

    const $el = wrap(node as Element | JQuery<Element>);
    const item = newItems[i]!;

    for (let j = 0, aLen = actions.length; j < aLen; j++) {
      const action = actions[j]!;
      if (action === 'onAdd' && onAdd) {
        onAdd($el);
        ctx.removingKeys.delete(newKeys[i]!);
        debug.domUpdated(SYSTEM_LIST.PREFIX, $el, 'list.add', item);
      } else if (action === 'bind' && bind) {
        bind($el, item, i);
      } else if (action === 'update' && update) {
        update($el, item, i);
      }
    }
  }
}
