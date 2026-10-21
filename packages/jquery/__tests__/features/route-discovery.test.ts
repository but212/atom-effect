import { describe, expect, it } from 'vitest';
import { reduceRouteEntries } from '@/features/route/discovery';

describe('reduceRouteEntries', () => {
  it('keeps the first template, fills a missing title, and selects the last default', () => {
    const entries = [
      { path: '/', templateIndex: 0, isDefault: false },
      { path: '/', templateIndex: 1, title: 'Home', isDefault: true },
      { path: '/', templateIndex: 2, title: 'Ignored', isDefault: false },
      { path: '/about', templateIndex: 3, title: 'About', isDefault: true },
    ] as const;

    expect(reduceRouteEntries(entries)).toEqual({
      routes: {
        '/': { templateIndex: 0, title: 'Home' },
        '/about': { templateIndex: 3, title: 'About' },
      },
      defaultPath: '/about',
    });
    expect(entries[0]).not.toHaveProperty('title');
  });

  it('returns no default when no route is marked default', () => {
    expect(reduceRouteEntries([{ path: '/home', templateIndex: 0, isDefault: false }])).toEqual({
      routes: { '/home': { templateIndex: 0 } },
      defaultPath: undefined,
    });
  });
});
