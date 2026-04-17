import $ from 'jquery';
import { LOG_PREFIXES } from '@/constants';
import type { ListOptions } from '@/types';
import { debug } from '@/utils/debug';
import { sanitizeHtml } from '@/utils/sanitize';
import type { ListContext } from './context';
import { ItemState, type PlaceCallbacks, type PreparedDiff } from './types';
import { cleanupNodes, setAtomKey, wrap } from './utils';

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
  const jq = elOrJq as JQuery;
  for (let i = 0, len = jq.length; i < len; i++) {
    const el = jq[i];
    if (el) container.insertBefore(el, nextNode);
  }
}

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

  const { oldKeys, oldNodes, onRemove } = ctx;
  if (!onRemove) {
    $container.empty();
  } else {
    for (let i = 0, len = oldKeys.length; i < len; i++) {
      const k = oldKeys[i]!,
        node = oldNodes[i];
      if (node) ctx.removeItem(k, wrap(node as Element | JQuery<Element>));
    }
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

export function renderItems<T>(
  diff: PreparedDiff<T>,
  options: ListOptions<T>,
  isInitial: boolean
): string[] | null {
  const { toRender, newNodes, newStates } = diff;
  const renderCount = toRender.length;
  if (renderCount === 0) return null;

  const results: (string | Element | DocumentFragment | JQuery)[] = new Array(renderCount);
  const htmlParts: string[] = [];
  let isAllStrings = true;

  for (let i = 0; i < renderCount; i++) {
    const raw = options.render(toRender[i]!.item, toRender[i]!.index);
    results[i] = raw;
    if (typeof raw === 'string') htmlParts.push(raw);
    else isAllStrings = false;
  }

  let sanitized: string[] | null = null;
  if (htmlParts.length > 0) sanitized = batchSanitize(htmlParts);

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
  for (let i = 0; i < renderCount; i++) {
    const { key, index: targetIdx } = toRender[i]!;
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

function batchSanitize(parts: string[]): string[] {
  if (parts.length === 1) return [sanitizeHtml(parts[0]!)];
  const sep = `<template data-atom-sep="s${Math.random().toString(36).slice(2)}"></template>`;
  return sanitizeHtml(parts.join(sep)).split(sep);
}

export function cleanupRemoved<T>(ctx: ListContext<T>, diff: PreparedDiff<T>): void {
  const { startIndex, oldEndIndex, newKeySet } = diff;
  for (let i = startIndex; i <= oldEndIndex; i++) {
    const k = ctx.oldKeys[i]!;
    if (!newKeySet.has(k) && ctx.oldNodes[i]) {
      ctx.removeItem(k, wrap(ctx.oldNodes[i] as Element | JQuery<Element>));
    }
  }
}

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
    for (let i = 0; i < count; i++) {
      if (!el) break;
      el.setAttribute('data-atom-key', String(newKeys[i]));
      newNodes[i] = el;
      newStates[i] = ItemState.Existing;
      debug.domUpdated(LOG_PREFIXES.LIST, $(el) as unknown as JQuery, 'list.add', newItems[i]);
      el = el.nextElementSibling;
    }
    return;
  }

  if (ctx.oldKeys.length === 0 && ctx.removingKeys.size === 0) {
    const frag = document.createDocumentFragment();
    for (const node of newNodes) {
      if (!node) continue;
      if (node instanceof Element) frag.appendChild(node);
      else {
        const jq = node as JQuery;
        for (let j = 0; j < jq.length; j++) {
          const entry = jq[j];
          if (entry) frag.appendChild(entry);
        }
      }
    }
    container.innerHTML = '';
    container.appendChild(frag);
  } else {
    let next: Node | null = null,
      min = Infinity;
    for (let i = count - 1; i >= 0; i--) {
      const idx = newIndices[i]!,
        node = newNodes[i];
      if (!node) continue;

      const first = node instanceof Element ? node : (node as JQuery)[0];
      if (first) {
        if (idx !== -1 && idx < min) min = idx;
        else insertOrAppend(node as Element | JQuery, next, container);
        next = first;
      }
    }
  }

  for (let i = 0; i < count; i++) {
    const state = newStates[i]!;
    if (state === ItemState.Unchanged) continue;

    const node = newNodes[i];
    if (!node) continue;

    const $el = wrap(node as Element | JQuery<Element>),
      item = newItems[i]!;
    if (state === ItemState.Existing) callbacks.update?.($el, item, i);
    else {
      callbacks.bind?.($el, item, i);
      if (state === ItemState.New) {
        callbacks.onAdd?.($el);
        ctx.removingKeys.delete(newKeys[i]!);
        debug.domUpdated(LOG_PREFIXES.LIST, $el, 'list.add', item);
      }
    }
  }
}
