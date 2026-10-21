import { afterEach, describe, expect, it } from 'vitest';
import { discoverRoutes } from '@/features/route/view';

const templates = () => Array.from(document.querySelectorAll('template'));

describe('discoverRoutes', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the first template, fills a missing title, and selects the last default', () => {
    document.body.innerHTML = `
      <template data-path="home"></template>
      <template data-path="home" title="Home" data-default></template>
      <template data-path="home" title="Ignored"></template>
      <template data-path="about" title="About" data-default></template>
    `;
    const [first, second, third, fourth] = templates();

    expect(discoverRoutes()).toEqual({
      routes: {
        home: { template: `#${first?.id}`, title: 'Home' },
        about: { template: `#${fourth?.id}`, title: 'About' },
      },
      default: 'about',
    });
    expect(first?.id).toMatch(/^route-/);
    expect(second?.id).toBe('');
    expect(third?.id).toBe('');
  });

  it('returns no default when no route is marked default', () => {
    document.body.innerHTML = '<template data-path="home"></template>';
    const [only] = templates();

    expect(discoverRoutes()).toEqual({
      routes: { home: { template: `#${only?.id}` } },
      default: undefined,
    });
  });
});
