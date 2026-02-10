/**
 * @fileoverview One-way binding micro-benchmarks
 * @description Measures binding creation and update overhead for each chainable method
 *
 * NOTE: Running in jsdom — measures binding overhead, not real browser rendering.
 */

import { bench, describe } from 'vitest';
import $ from '../../src/index';
import { cleanupContainer, createContainer, microBenchOptions } from '../utils/setup';

describe('atomText Binding', () => {
  bench(
    'create 100 text bindings',
    () => {
      const $c = createContainer();
      const source = $.atom('hello');
      for (let i = 0; i < 100; i++) {
        $('<span></span>').appendTo($c).atomText(source);
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'update text propagation (100 elements x 50 updates)',
    () => {
      const $c = createContainer();
      const source = $.atom('initial');
      for (let i = 0; i < 100; i++) {
        $('<span></span>').appendTo($c).atomText(source);
      }
      for (let i = 0; i < 50; i++) {
        source.value = `update-${i}`;
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'text binding with formatter (100 elements x 50 updates)',
    () => {
      const $c = createContainer();
      const source = $.atom(42);
      for (let i = 0; i < 100; i++) {
        $('<span></span>')
          .appendTo($c)
          .atomText(source, (v) => `Value: ${v}`);
      }
      for (let i = 0; i < 50; i++) {
        source.value = i;
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

describe('atomHtml Binding', () => {
  bench(
    'create 100 html bindings',
    () => {
      const $c = createContainer();
      const source = $.atom('<em>bold</em>');
      for (let i = 0; i < 100; i++) {
        $('<div></div>').appendTo($c).atomHtml(source);
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'update html propagation (100 elements x 50 updates)',
    () => {
      const $c = createContainer();
      const source = $.atom('<em>initial</em>');
      for (let i = 0; i < 100; i++) {
        $('<div></div>').appendTo($c).atomHtml(source);
      }
      for (let i = 0; i < 50; i++) {
        source.value = `<em>update-${i}</em>`;
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

describe('atomClass Binding', () => {
  bench(
    'create 100 class bindings',
    () => {
      const $c = createContainer();
      const condition = $.atom(false);
      for (let i = 0; i < 100; i++) {
        $('<div></div>').appendTo($c).atomClass('active', condition);
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'toggle class (100 elements x 100 toggles)',
    () => {
      const $c = createContainer();
      const condition = $.atom(false);
      for (let i = 0; i < 100; i++) {
        $('<div></div>').appendTo($c).atomClass('active', condition);
      }
      for (let i = 0; i < 100; i++) {
        condition.value = !condition.value;
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

describe('atomCss Binding', () => {
  bench(
    'create 100 css bindings',
    () => {
      const $c = createContainer();
      const width = $.atom(100);
      for (let i = 0; i < 100; i++) {
        $('<div></div>').appendTo($c).atomCss('width', width, 'px');
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'update css (100 elements x 100 updates)',
    () => {
      const $c = createContainer();
      const width = $.atom(100);
      for (let i = 0; i < 100; i++) {
        $('<div></div>').appendTo($c).atomCss('width', width, 'px');
      }
      for (let i = 0; i < 100; i++) {
        width.value = i * 10;
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

describe('atomAttr Binding', () => {
  bench(
    'create + update attr (100 elements x 100 updates)',
    () => {
      const $c = createContainer();
      const href = $.atom('#initial');
      for (let i = 0; i < 100; i++) {
        $('<a></a>').appendTo($c).atomAttr('href', href);
      }
      for (let i = 0; i < 100; i++) {
        href.value = `#page-${i}`;
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

describe('atomProp Binding', () => {
  bench(
    'create + update prop (100 elements x 100 updates)',
    () => {
      const $c = createContainer();
      const disabled = $.atom(false);
      for (let i = 0; i < 100; i++) {
        $('<button></button>').appendTo($c).atomProp('disabled', disabled);
      }
      for (let i = 0; i < 100; i++) {
        disabled.value = !disabled.value;
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

describe('atomShow / $.atomHide Binding', () => {
  bench(
    'show toggle (100 elements x 100 toggles)',
    () => {
      const $c = createContainer();
      const visible = $.atom(true);
      for (let i = 0; i < 100; i++) {
        $('<div>item</div>').appendTo($c).atomShow(visible);
      }
      for (let i = 0; i < 100; i++) {
        visible.value = !visible.value;
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'hide toggle (100 elements x 100 toggles)',
    () => {
      const $c = createContainer();
      const hidden = $.atom(false);
      for (let i = 0; i < 100; i++) {
        $('<div>item</div>').appendTo($c).atomHide(hidden);
      }
      for (let i = 0; i < 100; i++) {
        hidden.value = !hidden.value;
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

describe('atomBind (unified)', () => {
  bench(
    'create composite binding (text + class + css + show) x 100',
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

  bench(
    'update composite binding (100 elements x 50 updates)',
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
      for (let i = 0; i < 50; i++) {
        text.value = `update-${i}`;
        isActive.value = !isActive.value;
        width.value = i * 10;
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );
});
