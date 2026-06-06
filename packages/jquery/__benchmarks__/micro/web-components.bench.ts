/**
 * @fileoverview Micro-benchmarks for Custom Web Components (useAtomComponent, provide/inject context).
 */

import { bench, describe } from 'vitest';
import $, { type AtomComponentController } from '../../dist';
import { microBenchOptions, withContainer } from '../utils/setup';

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

describe('Web Components: Lifecycle & Context', () => {
  const run = (name: string, fn: ($c: JQuery) => void) =>
    bench(name, withContainer(fn), microBenchOptions);

  run('setup and teardown 100 components', ($c) => {
    const container = $c[0];
    if (!container) return;
    for (let i = 0; i < 100; i++) {
      const el = document.createElement('benchmark-comp') as BenchmarkComp;
      container.appendChild(el);
      el.setup();
      el.teardown();
      container.removeChild(el);
    }
  });

  const runDepthLookup = (depth: number) => ($c: JQuery) => {
    const root = $c[0];
    if (!root) return;
    $.provideAtom(root, 'context-key', 'context-value');
    let current = root;
    for (let i = 0; i < depth; i++) {
      current = current.appendChild(document.createElement('div'));
    }
    for (let i = 0; i < 100; i++) {
      $.injectAtom(current, 'context-key');
    }
  };

  run('context injection (depth 5, lookup 100x)', runDepthLookup(5));
  run('context injection (depth 20, lookup 100x)', runDepthLookup(20));

  run('context injection across Shadow DOM (depth 5 shadow hosts, lookup 100x)', ($c) => {
    const container = $c[0];
    if (!container) return;
    $.provideAtom(container, 'theme-context', 'dark-theme');

    let currentHost = container;
    for (let i = 0; i < 5; i++) {
      const host = currentHost.appendChild(document.createElement('div'));
      currentHost = host.attachShadow({ mode: 'open' }).appendChild(document.createElement('div'));
    }

    for (let i = 0; i < 100; i++) {
      $.injectAtom(currentHost, 'theme-context');
    }
  });
});
