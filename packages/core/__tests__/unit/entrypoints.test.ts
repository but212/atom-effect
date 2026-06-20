import { describe, expect, it } from 'vitest';
import * as CoreEntry from '@/core/index';
import * as PublicEntry from '@/index';

describe('Entrypoints Integrity', () => {
  it('should export all public APIs from the root index', () => {
    expect(PublicEntry.atom).toBeDefined();
    expect(PublicEntry.computed).toBeDefined();
    expect(PublicEntry.effect).toBeDefined();
    expect(PublicEntry.atomLens).toBeDefined();
    expect(PublicEntry.globalScheduler).toBeDefined();
    expect(PublicEntry.IS_DEV).toBeDefined();
    expect(PublicEntry.AtomError).toBeDefined();
    expect(PublicEntry.ComputedError).toBeDefined();
    expect(PublicEntry.EffectError).toBeDefined();
    expect(PublicEntry.SchedulerError).toBeDefined();
  });

  it('should export all core APIs from the core index', () => {
    expect(CoreEntry.atom).toBeDefined();
    expect(CoreEntry.computed).toBeDefined();
    expect(CoreEntry.effect).toBeDefined();
    expect(CoreEntry.atomLens).toBeDefined();
  });
});
