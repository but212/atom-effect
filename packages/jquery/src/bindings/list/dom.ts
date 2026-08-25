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
import { injectKeyToHtml, replaceDomNodes } from './utils';

function isJQuery(obj: unknown): obj is JQuery {
  return obj instanceof $;
}

function isStringArray(array: unknown[]): array is string[] {
  return array.every((element) => typeof element === 'string');
}

/**
 * Extracts raw Nodes from a render result.
 * Performance: Bypasses jQuery wrapper allocation.
 */
function getElements(elementSource: unknown): Node[] {
  if (typeof elementSource === 'string') {
    return $.parseHTML(elementSource) || [];
  }
  if (isJQuery(elementSource)) {
    return elementSource.get();
  }
  if (elementSource instanceof DocumentFragment) {
    return Array.from(elementSource.childNodes);
  }
  if (elementSource instanceof Node) {
    return [elementSource];
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
  if (ctx.$emptyElement && itemCount > 0) {
    ctx.$emptyElement.remove();
    ctx.$emptyElement = null;
  }
  if (itemCount !== 0) return;

  const { onRemove, snapshots } = ctx;

  if (onRemove) {
    for (const listSnapshot of snapshots) {
      if (listSnapshot.node) removeNode(ctx, listSnapshot.key, listSnapshot.node);
    }
  } else {
    $container.empty();
  }

  if (empty && !ctx.$emptyElement) {
    const elementSource = typeof empty === 'string' ? $.parseHTML(sanitizeHtml(empty)) : empty;
    if (elementSource) {
      ctx.$emptyElement = $(
        elementSource as Element | ArrayLike<Element> | JQuery<Element>
      ).appendTo($container);
    }
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

  const hasStrings = results.some((result) => typeof result === 'string');
  const sanitized = hasStrings
    ? results.map((result, i) => {
        const slot = toRender[i];
        const sanitizedResult = typeof result === 'string' ? sanitizeHtml(result) : result;
        if (typeof sanitizedResult === 'string' && slot !== undefined) {
          return injectKeyToHtml(sanitizedResult, String(slot.key));
        }
        return sanitizedResult;
      })
    : results;

  if (isInitial && isStringArray(sanitized) && !options.events) {
    const allNodes = $.parseHTML(sanitized.join(''));
    if (
      allNodes &&
      allNodes.length === renderCount &&
      allNodes.every((node) => node.nodeType === 1)
    ) {
      return sanitized;
    }
  }

  for (let i = 0; i < renderCount; i++) {
    const slot = toRender[i];
    const elementSource = sanitized[i];
    if (!slot || elementSource === undefined) continue;

    const nodes = getElements(elementSource);

    // Fallback: Ensure data-atom-key is set on all Element nodes
    for (const element of nodes) {
      if (element instanceof Element) {
        if (!element.hasAttribute('data-atom-key')) {
          element.setAttribute('data-atom-key', String(slot.key));
        }
      }
    }

    if (slot.state === ItemState.ForceReplace) {
      slot.oldNodes = slot.nodes;
    }
    slot.nodes = nodes;
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
    const listSnapshot = snapshots[i];
    if (listSnapshot?.node && !keyToIndex.has(listSnapshot.key)) {
      removeNode(ctx, listSnapshot.key, listSnapshot.node);
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
    // Fragments are pre-sanitized upstream (sanitizeHtml + injectKeyToHtml in
    // renderItems); parse inertly instead of assigning innerHTML.
    const parsedNodes = $.parseHTML(htmlFragments.join(''));
    const parsedFragment = document.createDocumentFragment();
    if (parsedNodes) {
      for (const node of parsedNodes) {
        if (node) parsedFragment.appendChild(node);
      }
    }
    container.replaceChildren(parsedFragment);
    let element = container.firstElementChild;
    const { bind, onAdd } = callbacks;

    for (let i = 0; i < count; i++) {
      if (!element) break;
      const slot = slots[i];
      if (!slot) continue;
      const { item } = slot;

      // Lazy wrapping: JQuery wrapper only allocated if callback exists
      const $element = bind || onAdd ? $(element as HTMLElement) : null;
      slot.nodes = [element];
      slot.state = ItemState.Existing;

      if (bind && $element) bind($element, item, i);
      if (onAdd && $element) {
        onAdd($element);
        debug.domUpdated(SYSTEM_LIST.PREFIX, $element, 'list.add', item);
      }
      element = element.nextElementSibling;
    }
    return;
  }

  // Swap ForceReplace nodes before reordering
  for (let i = 0; i < count; i++) {
    const slot = slots[i];
    if (slot && slot.state === ItemState.ForceReplace && slot.oldNodes && slot.nodes) {
      replaceDomNodes(slot.oldNodes, slot.nodes);
    }
  }

  if (ctx.snapshots.length === 0 && ctx.removingKeys.size === 0) {
    const documentFragment = document.createDocumentFragment();
    for (const slot of slots) {
      if (slot?.nodes) {
        for (let j = 0; j < slot.nodes.length; j++) {
          const element = slot.nodes[j];
          if (element) documentFragment.appendChild(element);
        }
      }
    }
    container.innerHTML = '';
    container.appendChild(documentFragment);
  } else {
    let next: Node | null = null;
    let minimumIndex = Infinity;
    for (let i = count - 1; i >= 0; i--) {
      const slot = slots[i];
      if (!slot) continue;
      const oldIndex = slot.oldIndex;
      const node = slot.nodes;
      if (!node) continue;

      const first = node[0];
      if (first) {
        if (oldIndex !== -1 && oldIndex < minimumIndex) {
          minimumIndex = oldIndex;
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
    const { state, nodes: node, item } = slot;
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
            debug.domUpdated(SYSTEM_LIST.PREFIX, $node, 'list.add', item);
          }
          break;
        case ItemState.ForceReplace:
          if (bind) bind($node, item, i);
          if (onAdd) {
            onAdd($node);
            debug.domUpdated(SYSTEM_LIST.PREFIX, $node, 'list.add', item);
          }
          break;
      }
    }
  }
}
