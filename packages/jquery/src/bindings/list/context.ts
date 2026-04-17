import type { EffectObject, ListKey } from '@/types';
import { setAtomKey } from './utils';

export class ListContext<T> {
  oldKeys: ListKey[] = [];

  oldItems: T[] = [];

  oldNodes: (Element | JQuery | undefined)[] = [];

  readonly removingKeys = new Set<ListKey>();

  $emptyEl: JQuery | null = null;

  readonly keyToIndex = new Map<ListKey, number>();

  fx?: EffectObject;

  constructor(
    public readonly $container: JQuery,

    public readonly containerSelector: string,
    public readonly onRemove: (($el: JQuery) => Promise<void> | void) | undefined
  ) {}

  scheduleRemoval(k: ListKey, $el: JQuery): void {
    const commit = () => {
      if (this.fx?.isDisposed) return;

      if ($el[0] instanceof Element && $el[0].hasAttribute('data-atom-key')) return;

      if ($el[0]?.isConnected) $el.remove();
      this.removingKeys.delete(k);
    };

    const res = this.onRemove?.($el);
    if (res instanceof Promise) res.then(commit, commit);
    else commit();
  }

  removeItem(k: ListKey, $el: JQuery): void {
    setAtomKey($el, null);
    this.removingKeys.add(k);
    this.scheduleRemoval(k, $el);
  }

  dispose(): void {
    this.removingKeys.clear();
    this.oldKeys = [];
    this.oldItems = [];
    this.oldNodes = [];
    this.keyToIndex.clear();
    this.$emptyEl?.remove();

    this.$container.off('.atomList');
  }
}
