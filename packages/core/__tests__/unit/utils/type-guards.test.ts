import { describe, expect, it } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { effect } from '@/core/effect';
import { debug } from '@/utils/debug';
import { isAtom, isComputed, isEffect } from '@/utils/type-guards';

describe('type-guards', () => {
  it('should identify atoms', () => {
    const a = atom(0);
    expect(isAtom(a)).toBe(true);
    expect(isAtom({})).toBe(false);
    expect(isAtom(null)).toBe(false);
  });

  it('should identify computed atoms', () => {
    const c = computed(() => 1);
    expect(isComputed(c)).toBe(true);
    expect(isComputed(atom(0))).toBe(false);
  });

  it('should identify effects', () => {
    const effectHandle = effect(() => {});
    expect(isEffect(effectHandle)).toBe(true);
    expect(isEffect({})).toBe(false);
  });

  it('should use debug info if enabled', () => {
    const wasEnabled = debug.enabled;
    debug.enabled = true;

    const c = computed(() => 1);
    // When debug is enabled, isComputed uses debug.getDebugType
    expect(isComputed(c)).toBe(true);

    debug.enabled = wasEnabled;
  });
});
