/**
 * @fileoverview Consolidated micro-benchmarks for atom-effect-jquery
 * @description Standardized performance metrics for bindings, inputs, lists, and sanitization.
 */

import { bench, describe } from 'vitest';
import $, { type AtomComponentController } from '../../dist';
import { cleanupContainer, createContainer, microBenchOptions } from '../utils/setup';

// ============================================================================
// 1. One-way Bindings
// ============================================================================

describe('Bindings: One-way Propagation', () => {
  bench(
    'create 100 text bindings',
    () => {
      const $c = createContainer();
      const source = $.atom('hello');
      for (let i = 0; i < 100; i++) $('<span></span>').appendTo($c).atomText(source);
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'update text (100 elements x 50 updates)',
    () => {
      const $c = createContainer();
      const source = $.atom('initial');
      for (let i = 0; i < 100; i++) $('<span></span>').appendTo($c).atomText(source);
      for (let i = 0; i < 50; i++) source.value = `update-${i}`;
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'update html (100 elements x 20 updates)',
    () => {
      const $c = createContainer();
      const source = $.atom('<em>initial</em>');
      for (let i = 0; i < 100; i++) $('<div></div>').appendTo($c).atomHtml(source);
      for (let i = 0; i < 20; i++) source.value = `<strong>update-${i}</strong>`;
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'toggle class (100 elements x 100 toggles)',
    () => {
      const $c = createContainer();
      const condition = $.atom(false);
      for (let i = 0; i < 100; i++) $('<div></div>').appendTo($c).atomClass('active', condition);
      for (let i = 0; i < 100; i++) condition.value = !condition.value;
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'composite binding (text+class+css+show) creation x 100',
    () => {
      const $c = createContainer();
      const text = $.atom('hello');
      const isActive = $.atom(true);
      const width = $.atom(100);
      for (let i = 0; i < 100; i++) {
        $('<div></div>')
          .appendTo($c)
          .atomBind({
            text,
            class: { active: isActive },
            css: { width: [width, 'px'] },
            show: isActive,
          });
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

// ============================================================================
// 2. Two-way Bindings (Inputs)
// ============================================================================

describe('Bindings: Two-way (Input/Checked)', () => {
  bench(
    'atom → DOM: input val (100 inputs x 100 updates)',
    () => {
      const $c = createContainer();
      const source = $.atom('initial');
      for (let i = 0; i < 100; i++) $('<input type="text">').appendTo($c).atomVal(source);
      for (let i = 0; i < 100; i++) source.value = `value-${i}`;
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'DOM → atom: input val (trigger 100 events)',
    () => {
      const $c = createContainer();
      const source = $.atom('initial');
      const $input = $('<input type="text">').appendTo($c).atomVal(source);
      for (let i = 0; i < 100; i++) {
        $input.val(`typed-${i}`);
        $input.trigger('input');
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'checkbox toggle (100 elements x 100 toggles)',
    () => {
      const $c = createContainer();
      const checked = $.atom(false);
      for (let i = 0; i < 100; i++) $('<input type="checkbox">').appendTo($c).atomChecked(checked);
      for (let i = 0; i < 100; i++) checked.value = !checked.value;
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

// ============================================================================
// 3. List Rendering (atomList)
// ============================================================================

describe('List Rendering: atomList', () => {
  const listOptions = {
    key: 'id' as const,
    render: (item: any) => `<div class="item">${item.text}</div>`,
  };

  const makeItems = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ id: i + 1, text: `Item ${i + 1}` }));

  bench(
    'initial render: 1000 items',
    () => {
      const $c = createContainer();
      const items = $.atom(makeItems(1000));
      $c.atomList(items, listOptions);
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'reconciliation: append 10 items to 100',
    () => {
      const $c = createContainer();
      const base = makeItems(100);
      const items = $.atom(base);
      $c.atomList(items, listOptions);
      items.value = [
        ...base,
        ...Array.from({ length: 10 }, (_, i) => ({ id: 101 + i, text: `New ${101 + i}` })),
      ];
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'reconciliation: full shuffle 100 items',
    () => {
      const $c = createContainer();
      const base = makeItems(100);
      const items = $.atom(base);
      $c.atomList(items, listOptions);
      items.value = [...base].sort(() => Math.random() - 0.5);
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'render 100 items with bind callback',
    () => {
      const $c = createContainer();
      const items = $.atom(makeItems(100));
      $c.atomList(items, {
        key: 'id',
        render: () => '<div class="item"><span class="label"></span></div>',
        bind: ($el, item) => {
          $el.find('.label').atomText($.atom(item.text));
          $el.atomClass('even', $.atom(item.id % 2 === 0));
        },
      });
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

// ============================================================================
// 4. Web Components
// ============================================================================
describe('web component', () => {
  class TestComp extends HTMLElement {
    controller?: AtomComponentController;
    setup() {
      this.controller = $.useAtomComponent(this);
      this.controller?.setup();
    }
    teardown() {
      this.controller?.teardown();
    }
  }

  if (!customElements.get('test-comp')) {
    customElements.define('test-comp', TestComp);
  }

  bench(
    'Web Component: setup/teardown (100)',
    () => {
      const $c = createContainer();
      const container = $c[0];
      for (let i = 0; i < 100; i++) {
        const el = document.createElement('test-comp') as TestComp;
        container?.appendChild(el);
        el.setup();
        el.teardown();
        container?.removeChild(el);
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'Web Component: context injection (depth 10, 100x)',
    () => {
      const $c = createContainer();
      const root = $c[0]!;

      $.provideAtom(root, 'test-key', 'test-value');

      let current: HTMLElement = root;
      for (let i = 0; i < 10; i++) {
        const child = document.createElement('div');
        current.appendChild(child);
        current = child;
      }

      const leaf = current;
      for (let i = 0; i < 100; i++) {
        $.injectAtom(leaf, 'test-key');
      }

      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'Web Component: context injection across Shadow DOM (depth 5, 100x)',
    () => {
      const $c = createContainer();
      const container = $c[0]!;

      $.provideAtom(container, 'theme', 'dark');

      let currentHost: HTMLElement = container;
      for (let i = 0; i < 5; i++) {
        const host = document.createElement('div');
        currentHost.appendChild(host);
        const shadow = host.attachShadow({ mode: 'open' });
        const child = document.createElement('div');
        shadow.appendChild(child);
        currentHost = child;
      }

      const leaf = currentHost;
      for (let i = 0; i < 100; i++) {
        $.injectAtom(leaf, 'theme');
      }

      cleanupContainer($c);
    },
    microBenchOptions
  );
});
