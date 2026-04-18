import {
  aeNextTick,
  atom,
  atomLens,
  batch,
  composeLens,
  computed,
  effect,
  isAtom,
  isComputed,
  lensFor,
  untracked,
} from '@but212/atom-effect';
import $ from 'jquery';
import { debug } from '@/utils/debug';

export const nextTick = (): Promise<void> => aeNextTick();

$.extend({
  atom,
  computed,
  effect,
  batch,
  untracked,
  isAtom,
  isComputed,
  nextTick,
  atomLens,
  composeLens,
  lensFor,

  debug,
});
