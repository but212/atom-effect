import { LOG_PREFIXES } from '@/constants';
import type { EffectObject, ListKey } from '@/types';
import { debug } from '@/utils/debug';

export class ListContext<T> {
  oldKeys: ListKey[] = [];
  oldItems: T[] = [];
  oldNodes: (Element | JQuery | undefined)[] = [];

  readonly removingKeys = new Set<ListKey>();
  $emptyEl: JQuery | null = null;
  readonly keyToIndex = new Map<ListKey, number>();
  fx?: EffectObject;

  statesBuffer = new Uint8Array(256);
  indicesBuffer = new Int32Array(256);

  constructor(
    public readonly $container: JQuery,
    /** @internal */
    public readonly containerSelector: string,
    public readonly onRemove: (($el: JQuery) => Promise<void> | void) | undefined
  ) {}

  scheduleRemoval(k: ListKey, $el: JQuery): void {
    const commit = () => {
      if (this.fx?.isDisposed) return;
      if ($el[0]?.isConnected) $el.remove();
      this.removingKeys.delete(k);
      debug.log(LOG_PREFIXES.LIST, `${this.containerSelector} removed item:`, k);
    };

    const res = this.onRemove?.($el);
    if (res instanceof Promise) res.then(commit, commit);
    else commit();
  }

  removeItem(k: ListKey, $el: JQuery): void {
    for (let j = 0; j < $el.length; j++) {
      if ($el[j] instanceof Element) ($el[j] as Element).removeAttribute('data-atom-key');
    }
    this.removingKeys.add(k);
    this.scheduleRemoval(k, $el);
  }

  dispose(): void {
    this.removingKeys.clear();
    this.oldKeys.length = 0;
    this.oldItems.length = 0;
    this.oldNodes.length = 0;
    this.keyToIndex.clear();
    this.$emptyEl?.remove();
    this.$container.off('.atomList');
    this.statesBuffer = new Uint8Array(0);
    this.indicesBuffer = new Int32Array(0);
  }

  ensureBuffers(size: number): void {
    if (this.statesBuffer.length < size) {
      this.statesBuffer = new Uint8Array(Math.max(size, this.statesBuffer.length * 2));
    }
    if (this.indicesBuffer.length < size) {
      this.indicesBuffer = new Int32Array(Math.max(size, this.indicesBuffer.length * 2));
    }
  }
}
