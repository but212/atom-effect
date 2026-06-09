/**
 * @fileoverview Micro-benchmarks for SPA routing system ($.route).
 */

import { bench, describe } from 'vitest';
import $, { type RouteConfig, type Router } from '../../dist';
import { createContainer, microBenchOptions, withContainer } from '../utils/setup';

function createRouteConfig(target: HTMLElement, count: number): RouteConfig {
  const routes: Record<string, { render: () => void }> = {};
  for (let i = 0; i < count; i++) {
    routes[`/route-${i}`] = {
      render: () => {
        target.appendChild(document.createElement('div')).textContent = `Route ${i} content`;
      },
    };
  }
  return { target, routes, mode: 'hash', autoBindLinks: false, default: '/route-0' };
}

describe('Routing: Router Setup Overhead', () => {
  const run = (count: number) =>
    withContainer(($c) => {
      const container = $c[0];
      if (!container) return;
      const config = createRouteConfig(container, count);
      $.route(config).destroy();
    });

  bench('setup router with 5 routes', run(5), microBenchOptions);
  bench('setup router with 50 routes', run(50), microBenchOptions);
});

describe('Routing: Path Matching Compile and Lookup', () => {
  const routeCases = [
    { name: 'match static route (/)', path: '/' },
    { name: 'match parameterized route (/users/123)', path: '/users/123' },
    {
      name: 'match multi-parameterized route (/users/123/posts/456)',
      path: '/users/123/posts/456',
    },
  ];

  for (const { name, path } of routeCases) {
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
  }
});

describe('Routing: View Transitions rendering', () => {
  const run = (name: string, fn: ($c: JQuery) => void | Promise<void>, iterations = 20) =>
    bench(name, withContainer(fn), { ...microBenchOptions, iterations });

  run('navigate and swap simple render views (50 times)', async ($c) => {
    const container = $c[0];
    if (!container) return;
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
  });

  run('navigate with onLeave guard and custom unmount cleanups', async ($c) => {
    let _disposeCount = 0;
    const container = $c[0];
    if (!container) return;
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
          onLeave: () => true,
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
  });

  run(
    'scan document and bind active highlighting to 100 links',
    ($c) => {
      const container = $c[0];
      if (!container) return;
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
    },
    200
  ); // default to 200 iterations for micro-benchmark
});
