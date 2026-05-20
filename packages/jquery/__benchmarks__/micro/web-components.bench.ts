/**
 * @fileoverview Micro-benchmarks for Custom Web Components (useAtomComponent, provide/inject context).
 */

import { bench, describe } from 'vitest';
import $, { type AtomComponentController } from '../../dist';
import { cleanupContainer, createContainer, microBenchOptions } from '../utils/setup';

class BenchmarkComp extends HTMLElement {
  controller?: AtomComponentController;
  setup(): void {
    this.controller = $.useAtomComponent(this);
    this.controller?.setup();
  }
  teardown(): void {
    this.controller?.teardown();
  }
}

if (!customElements.get('benchmark-comp')) {
  customElements.define('benchmark-comp', BenchmarkComp);
}

// ============================================================================
// 1. Controller setup / teardown
// ============================================================================

describe('Web Components: Controller Lifecycle', () => {
  bench(
    'setup and teardown 100 components',
    () => {
      const $c = createContainer();
      const container = $c[0]!;
      for (let i = 0; i < 100; i++) {
        const el = document.createElement('benchmark-comp') as BenchmarkComp;
        container.appendChild(el);
        el.setup();
        el.teardown();
        container.removeChild(el);
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

// ============================================================================
// 2. Context injection (depth lookup)
// ============================================================================

describe('Web Components: Context Lookup Depth', () => {
  const runDepthLookup = (depth: number) => {
    const $c = createContainer();
    const root = $c[0]!;

    // Register provider on root
    $.provideAtom(root, 'context-key', 'context-value');

    // Build DOM tree of specified depth
    let current = root;
    for (let i = 0; i < depth; i++) {
      const child = document.createElement('div');
      current.appendChild(child);
      current = child;
    }

    const leaf = current;

    // Run lookup multiple times to measure traversal cost
    for (let i = 0; i < 100; i++) {
      $.injectAtom(leaf, 'context-key');
    }

    cleanupContainer($c);
  };

  bench(
    'context injection (depth 5, lookup 100x)',
    () => {
      runDepthLookup(5);
    },
    microBenchOptions
  );

  bench(
    'context injection (depth 20, lookup 100x)',
    () => {
      runDepthLookup(20);
    },
    microBenchOptions
  );
});

// ============================================================================
// 3. Shadow DOM Context Traversal
// ============================================================================

describe('Web Components: Shadow DOM Boundary Traversal', () => {
  bench(
    'context injection across Shadow DOM (depth 5 shadow hosts, lookup 100x)',
    () => {
      const $c = createContainer();
      const container = $c[0]!;

      // Register provider
      $.provideAtom(container, 'theme-context', 'dark-theme');

      let currentHost = container;
      for (let i = 0; i < 5; i++) {
        const host = document.createElement('div');
        currentHost.appendChild(host);
        const shadow = host.attachShadow({ mode: 'open' });
        const child = document.createElement('div');
        shadow.appendChild(child);
        currentHost = child;
      }

      const leaf = currentHost;

      // Injecting from the deepest nested element inside Shadow DOM
      for (let i = 0; i < 100; i++) {
        $.injectAtom(leaf, 'theme-context');
      }

      cleanupContainer($c);
    },
    microBenchOptions
  );
});
