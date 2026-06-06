/**
 * @fileoverview Micro-benchmarks for SPA routing system ($.route).
 */

import { bench, describe } from 'vitest';
import $, { type RouteConfig, type Router } from '../../dist';
import { createContainer, microBenchOptions, withContainer } from '../utils/setup';

function createRouteConfig(target: HTMLElement, routesCount: number): RouteConfig {
  const routes: Record<string, { render: () => void }> = {};
  for (let i = 0; i < routesCount; i++) {
    routes[`/route-${i}`] = {
      render: () => {
        const div = document.createElement('div');
        div.textContent = `Route ${i} content`;
        target.appendChild(div);
      },
    };
  }
  return {
    target,
    routes,
    mode: 'hash',
    autoBindLinks: false,
    default: '/route-0',
  };
}

// ============================================================================
// 1. Router Initialization
// ============================================================================

describe('Routing: Router Setup Overhead', () => {
  const runSetup = (count: number) =>
    withContainer(($c) => {
      const container = $c[0];
      if (!container) throw new Error('Container not found');
      const config = createRouteConfig(container, count);
      const r = $.route(config);
      r.destroy();
    });

  bench('setup router with 5 routes', runSetup(5), microBenchOptions);
  bench('setup router with 50 routes', runSetup(50), microBenchOptions);
});

// ============================================================================
// 2. Route Matching / Parameter Resolution
// ============================================================================

describe('Routing: Path Matching Compile and Lookup', () => {
  const createRoutingBench = (name: string, path: string) => {
    let $c: JQuery;
    let r: Router;
    bench(
      name,
      async () => {
        await r.navigate(path);
      },
      {
        ...microBenchOptions,
        setup() {
          $c = createContainer();
          const container = $c[0];
          if (!container) throw new Error('Container not found');
          r = $.route({
            target: container,
            routes: {
              '/': { render: () => {} },
              '/users/:id': { render: () => {} },
              '/users/:id/posts/:postId': { render: () => {} },
              '/items/*': { render: () => {} },
            },
            mode: 'history',
            autoBindLinks: false,
            default: '/',
          });
        },
        teardown() {
          r.destroy();
          $c.atomUnbind().remove();
        },
      }
    );
  };

  createRoutingBench('match static route (/)', '/');
  createRoutingBench('match parameterized route (/users/123)', '/users/123');
  createRoutingBench(
    'match multi-parameterized route (/users/123/posts/456)',
    '/users/123/posts/456'
  );
});

// ============================================================================
// 3. View Transitions & Swapping
// ============================================================================

describe('Routing: View Transitions rendering', () => {
  bench(
    'navigate and swap simple render views (50 times)',
    withContainer(async ($c) => {
      const container = $c[0];
      if (!container) throw new Error('Container not found');
      const r = $.route({
        target: container,
        routes: {
          '/a': {
            render: (el) => {
              el.innerHTML = '<div>View A</div>';
            },
          },
          '/b': {
            render: (el) => {
              el.innerHTML = '<div>View B</div>';
            },
          },
        },
        mode: 'hash',
        autoBindLinks: false,
        default: '/a',
      });

      for (let i = 0; i < 25; i++) {
        await r.navigate('/b');
        await r.navigate('/a');
      }

      r.destroy();
    }),
    { ...microBenchOptions, iterations: 20 }
  );

  bench(
    'navigate with onLeave guard and custom unmount cleanups',
    withContainer(async ($c) => {
      const container = $c[0];
      if (!container) throw new Error('Container not found');
      let _disposeCount = 0;

      const r = $.route({
        target: container,
        routes: {
          '/a': {
            render: (el, _, __, onUnmount) => {
              el.innerHTML = '<div>View A</div>';
              onUnmount(() => {
                _disposeCount++;
              });
            },
            onLeave: () => {
              return true;
            },
          },
          '/b': {
            render: (el) => {
              el.innerHTML = '<div>View B</div>';
            },
          },
        },
        mode: 'hash',
        autoBindLinks: false,
        default: '/a',
      });

      for (let i = 0; i < 20; i++) {
        await r.navigate('/b');
        await r.navigate('/a');
      }

      r.destroy();
    }),
    { ...microBenchOptions, iterations: 20 }
  );
});

// ============================================================================
// 4. Link Scanning (Active class highlight)
// ============================================================================

describe('Routing: Navigation Link Scanning', () => {
  bench(
    'scan document and bind active highlighting to 100 links',
    withContainer(($c) => {
      const container = $c[0];
      if (!container) throw new Error('Container not found');
      const r = $.route({
        target: container,
        routes: {
          '/route-0': { render: () => {} },
          '/route-1': { render: () => {} },
        },
        mode: 'hash',
        autoBindLinks: true,
        activeClass: 'is-active',
        default: '/route-0',
      });

      const frag = document.createDocumentFragment();
      for (let i = 0; i < 100; i++) {
        const a = document.createElement('a');
        a.setAttribute('href', `#/route-${i % 2}`);
        frag.appendChild(a);
      }
      container.appendChild(frag);

      r.navigate('/route-1');

      r.destroy();
    }),
    microBenchOptions
  );
});
