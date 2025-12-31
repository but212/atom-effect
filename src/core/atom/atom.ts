/**
 * @fileoverview atom: Core reactive state primitive
 */

import { AtomError } from '../../errors/errors';
import { ERROR_MESSAGES } from '../../errors/messages';
import type { AtomOptions, WritableAtom } from '../../types';
import { debug, generateId } from '../../utils/debug';
import { scheduler } from '../../scheduler';
import { trackingContext } from '../../tracking';

class AtomImpl<T> implements WritableAtom<T> {
  private _value: T;
  private _version: number;
  private _fnSubs: Array<(newValue?: T, oldValue?: T) => void>;
  private _fnSubCount: number;
  private _objSubs: Array<{ execute: () => void }>;
  private _objSubCount: number;
  private readonly _sync: boolean;
  private readonly _id: string;

  constructor(initialValue: T, sync: boolean) {
    this._value = initialValue;
    this._version = 0;
    this._fnSubs = [];
    this._fnSubCount = 0;
    this._objSubs = [];
    this._objSubCount = 0;
    this._sync = sync;
    this._id = generateId().toString();

    debug.attachDebugInfo(this, 'atom', generateId());
  }

  get value(): T {
    const current = trackingContext.getCurrent();
    if (current !== null && current !== undefined) {
      this._track(current);
    }
    return this._value;
  }

  set value(newValue: T) {
    if (Object.is(this._value, newValue)) return;

    const oldValue = this._value;
    const currentVersion = ++this._version;
    this._value = newValue;

    if ((this._fnSubCount | this._objSubCount) === 0) return;

    this._notify(newValue, oldValue, currentVersion);
  }

  private _track(current: unknown): void {
    if (typeof current === 'function') {
      const fnWithDep = current as { addDependency?: (dep: unknown) => void };
      if (fnWithDep.addDependency !== undefined) {
        fnWithDep.addDependency(this);
      } else {
        this._addFnSub(current as (newValue?: T, oldValue?: T) => void);
      }
    } else {
      const tracker = current as { execute?: () => void; addDependency?: (dep: unknown) => void };
      if (tracker.addDependency !== undefined) {
        tracker.addDependency(this);
      } else if (tracker.execute !== undefined) {
        this._addObjSub(tracker as { execute: () => void });
      }
    }
  }

  private _addFnSub(sub: (newValue?: T, oldValue?: T) => void): () => void {
    const subs = this._fnSubs;
    const idx = this._fnSubCount;

    for (let i = 0; i < idx; i++) {
      if (subs[i] === sub) return this._createUnsub(i, true);
    }

    subs[idx] = sub;
    this._fnSubCount = idx + 1;

    return this._createUnsub(idx, true);
  }

  private _addObjSub(sub: { execute: () => void }): void {
    const subs = this._objSubs;
    const count = this._objSubCount;

    for (let i = 0; i < count; i++) {
      if (subs[i] === sub) return;
    }

    subs[count] = sub;
    this._objSubCount = count + 1;
  }

  private _createUnsub(idx: number, isFn: boolean): () => void {
    return () => {
      if (isFn) {
        this._removeFnSub(idx);
      } else {
        this._removeObjSub(idx);
      }
    };
  }

  private _removeFnSub(idx: number): void {
    const count = this._fnSubCount;
    if (idx >= count) return;

    const lastIdx = count - 1;
    const subs = this._fnSubs;

    subs[idx] = subs[lastIdx] as (newValue?: T, oldValue?: T) => void;
    subs[lastIdx] = undefined as any;
    this._fnSubCount = lastIdx;
  }

  private _removeObjSub(idx: number): void {
    const count = this._objSubCount;
    if (idx >= count) return;

    const lastIdx = count - 1;
    const subs = this._objSubs;

    subs[idx] = subs[lastIdx] as { execute: () => void };
    subs[lastIdx] = undefined as any;
    this._objSubCount = lastIdx;
  }

  private _notify(newValue: T, oldValue: T, currentVersion: number): void {
    const doNotify = (): void => {
      if (this._version !== currentVersion) return;

      const fnSubs = this._fnSubs;
      const fnCount = this._fnSubCount;
      const objSubs = this._objSubs;
      const objCount = this._objSubCount;

      for (let i = 0; i < fnCount; i++) {
        try {
          const fn = fnSubs[i];
          if (fn) {
            fn(newValue, oldValue);
          }
        } catch (e) {
          console.error(
            new AtomError(ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED, e as Error)
          );
        }
      }

      for (let i = 0; i < objCount; i++) {
        try {
          const sub = objSubs[i];
          if (sub) {
            sub.execute();
          }
        } catch (e) {
          console.error(
            new AtomError(ERROR_MESSAGES.ATOM_INDIVIDUAL_SUBSCRIBER_FAILED, e as Error)
          );
        }
      }
    };

    if (this._sync && !scheduler.isBatching) {
      doNotify();
    } else {
      scheduler.schedule(doNotify);
    }
  }

  subscribe(listener: (newValue?: T, oldValue?: T) => void): () => void {
    if (typeof listener !== 'function') {
      throw new AtomError(ERROR_MESSAGES.ATOM_SUBSCRIBER_MUST_BE_FUNCTION);
    }
    return this._addFnSub(listener);
  }

  peek(): T {
    return this._value;
  }

  dispose(): void {
    this._fnSubs.length = 0;
    this._objSubs.length = 0;
    this._fnSubCount = 0;
    this._objSubCount = 0;
    this._value = undefined as T;
  }

  subscriberCount(): number {
    return this._fnSubCount + this._objSubCount;
  }
}

export function atom<T>(initialValue: T, options: AtomOptions = {}): WritableAtom<T> {
  return new AtomImpl(initialValue, options.sync ?? false);
}
