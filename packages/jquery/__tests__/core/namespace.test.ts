import { describe, expect, it } from 'vitest';
import $ from '@/index';

describe('jQuery namespace surface', () => {
  it.each(['atom', 'computed', 'effect', 'batch', 'nextTick', 'isAtom', 'isPromise', 'debug'])(
    'exposes $.%s',
    (name) => {
      expect(($ as unknown as Record<string, unknown>)[name]).toBeDefined();
    }
  );

  it.each([
    'atomLens',
    'composeLens',
    'lensFor',
    'mergeLenses',
    'mergeAtoms',
    'isComputed',
    'isEffect',
    'untracked',
  ])('does not expose $.%s', (name) => {
    expect(($ as unknown as Record<string, unknown>)[name]).toBeUndefined();
  });
});
