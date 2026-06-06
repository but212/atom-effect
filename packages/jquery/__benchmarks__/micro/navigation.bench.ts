/**
 * @fileoverview Micro-benchmarks for PJAX reactive navigation (atomNav).
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { microBenchOptions, withContainer } from '../utils/setup';

const mockHtml = `
  <div id="main-content">
    <title>Target Page Title</title>
    <meta name="description" content="Target description">
    <div class="content">Target content block</div>
  </div>
`;

$.ajax = (): JQuery.jqXHR => {
  const def = $.Deferred<string, string, never>().resolve(mockHtml);
  return {
    ...def.promise(),
    abort: () => {},
    getResponseHeader: (h: string) =>
      h === 'X-PJAX-URL' ? '/target-page' : h === 'X-PJAX-Title' ? 'New Title' : null,
  } as unknown as JQuery.jqXHR;
};

describe('Navigation: Setup & E2E Programmatic Transitions', () => {
  const run = (name: string, fn: ($c: JQuery) => void | Promise<void>, iterations = 200) =>
    bench(name, withContainer(fn), { ...microBenchOptions, iterations });

  run('initialize and destroy atomNav', ($c) => {
    $c.attr('id', 'main-content');
    $.atomNav({ target: $c, selector: 'a[data-nav]' }).destroy();
  });

  run(
    'navigate E2E (fetch mock html -> extract -> reconcile DOM)',
    async ($c) => {
      $c.attr('id', 'main-content');
      const nav = $.atomNav({ target: $c, selector: 'a[data-nav]', syncTitle: true });
      await nav.navigate('/target-page');
      nav.destroy();
    },
    50
  );

  run(
    'navigate E2E with before/mount hooks',
    async ($c) => {
      $c.attr('id', 'main-content');
      let _mountCalled = 0;
      const nav = $.atomNav({
        target: $c,
        selector: 'a[data-nav]',
        onBeforeLoad: async () => true,
        onMount: () => {
          _mountCalled++;
        },
      });
      await nav.navigate('/target-page');
      nav.destroy();
    },
    50
  );

  run('intercept click event on a[data-nav] (100 times)', ($c) => {
    $c.attr('id', 'main-content');
    const nav = $.atomNav({ target: $c, selector: 'a[data-nav]' });
    const frag = document.createDocumentFragment();
    const anchors: HTMLAnchorElement[] = [];

    for (let i = 0; i < 100; i++) {
      const a = document.createElement('a');
      a.setAttribute('href', `/page-${i}`);
      a.setAttribute('data-nav', 'true');
      frag.appendChild(a);
      anchors.push(a);
    }
    $c[0]?.appendChild(frag);

    for (let i = 0; i < 100; i++) {
      anchors[i]?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
      );
    }
    nav.destroy();
  });
});
