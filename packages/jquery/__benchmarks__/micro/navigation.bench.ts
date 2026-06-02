/**
 * @fileoverview Micro-benchmarks for PJAX reactive navigation (atomNav).
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { cleanupContainer, createContainer, microBenchOptions } from '../utils/setup';

// Setup AJAX mock to keep fetch immediate and network-independent
const originalAjax = $.ajax;

function setupMockAjax(htmlContent: string): void {
  $.ajax = (
    _urlOrSettings?: string | JQuery.AjaxSettings,
    _settings?: JQuery.AjaxSettings
  ): JQuery.jqXHR => {
    const deferred = $.Deferred<string, string, never>();
    deferred.resolve(htmlContent);
    const promise = deferred.promise();
    return {
      ...promise,
      abort: () => {},
      getResponseHeader: (header: string) => {
        if (header === 'X-PJAX-URL') return '/target-page';
        if (header === 'X-PJAX-Title') return 'New Title';
        return null;
      },
    } as unknown as JQuery.jqXHR;
  };
}

function restoreAjax(): void {
  $.ajax = originalAjax;
}

// ============================================================================
// 1. Navigation Initialization
// ============================================================================

describe('Navigation: Setup & Teardown', () => {
  bench(
    'initialize and destroy atomNav',
    () => {
      const $c = createContainer();
      $c.attr('id', 'main-content');
      const nav = $.atomNav({
        target: $c,
        selector: 'a[data-nav]',
      });
      nav.destroy();
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

// ============================================================================
// 2. Programmatic PJAX Transition E2E
// ============================================================================

describe('Navigation: E2E Programmatic Transitions', () => {
  const mockHtml = `
    <div id="main-content">
      <title>Target Page Title</title>
      <meta name="description" content="Target description">
      <div class="content">Target content block</div>
    </div>
  `;

  bench(
    'navigate E2E (fetch mock html -> extract -> reconcile DOM)',
    async () => {
      setupMockAjax(mockHtml);
      const $c = createContainer();
      $c.attr('id', 'main-content');

      const nav = $.atomNav({
        target: $c,
        selector: 'a[data-nav]',
        syncTitle: true,
      });

      await nav.navigate('/target-page');

      nav.destroy();
      cleanupContainer($c);
      restoreAjax();
    },
    { ...microBenchOptions, iterations: 50 } // Moderately complex DOM manipulations
  );

  bench(
    'navigate E2E with before/mount hooks',
    async () => {
      setupMockAjax(mockHtml);
      const $c = createContainer();
      $c.attr('id', 'main-content');
      let _mountCalled = 0;

      const nav = $.atomNav({
        target: $c,
        selector: 'a[data-nav]',
        onBeforeLoad: async () => {
          return true; // continue
        },
        onMount: () => {
          _mountCalled++;
        },
      });

      await nav.navigate('/target-page');

      nav.destroy();
      cleanupContainer($c);
      restoreAjax();
    },
    { ...microBenchOptions, iterations: 50 }
  );
});

// ============================================================================
// 3. Click Interception
// ============================================================================

describe('Navigation: Anchor Click Interception', () => {
  bench(
    'intercept click event on a[data-nav] (100 times)',
    () => {
      const $c = createContainer();
      $c.attr('id', 'main-content');

      const nav = $.atomNav({
        target: $c,
        selector: 'a[data-nav]',
      });

      // Append 100 anchor tags
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

      // Trigger standard click event simulation
      for (let i = 0; i < 100; i++) {
        const event = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
        });
        anchors[i]?.dispatchEvent(event);
      }

      nav.destroy();
      cleanupContainer($c);
    },
    microBenchOptions
  );
});
