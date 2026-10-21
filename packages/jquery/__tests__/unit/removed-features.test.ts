import { describe, expect, it } from 'vitest';
import $ from '@/index';

describe('removed features', () => {
  it.each(['route', 'atomFetch', 'provideAtom', 'injectAtom', 'useAtomComponent'])(
    '$.%s is not registered',
    (name) => {
      expect(($ as unknown as Record<string, unknown>)[name]).toBeUndefined();
    }
  );

  it('keeps core bindings registered', () => {
    expect(typeof $.atom).toBe('function');
    expect(typeof $.fn.atomText).toBe('function');
  });
});
