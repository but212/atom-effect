/**
 * @fileoverview Micro-benchmarks for jQuery bindings (one-way, two-way, form bindings).
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { cleanupContainer, createContainer, microBenchOptions } from '../utils/setup';

// ============================================================================
// 1. One-way Bindings & Baselines
// ============================================================================

describe('Bindings: One-way (Creation)', () => {
  bench(
    'Native: create 100 text nodes',
    () => {
      const $c = createContainer();
      const container = $c[0];
      if (container) {
        for (let i = 0; i < 100; i++) {
          const span = document.createElement('span');
          span.textContent = 'hello';
          container.appendChild(span);
        }
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'jQuery: create 100 text elements',
    () => {
      const $c = createContainer();
      for (let i = 0; i < 100; i++) {
        $('<span></span>').appendTo($c).text('hello');
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'atom-effect: create 100 text bindings (atomText)',
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
    'atom-effect: create 100 HTML bindings (atomHtml)',
    () => {
      const $c = createContainer();
      const source = $.atom('<em>hello</em>');
      for (let i = 0; i < 100; i++) {
        $('<div></div>').appendTo($c).atomHtml(source);
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

describe('Bindings: One-way (Updates)', () => {
  bench(
    'Native: update text (100 elements x 50 updates)',
    () => {
      const $c = createContainer();
      const container = $c[0];
      if (container) {
        const elements: HTMLElement[] = [];
        for (let i = 0; i < 100; i++) {
          const span = document.createElement('span');
          container.appendChild(span);
          elements.push(span);
        }
        for (let i = 0; i < 50; i++) {
          const val = `update-${i}`;
          for (let j = 0; j < 100; j++) {
            const el = elements[j];
            if (el) el.textContent = val;
          }
        }
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'jQuery: update text (100 elements x 50 updates)',
    () => {
      const $c = createContainer();
      const $elements: JQuery[] = [];
      for (let i = 0; i < 100; i++) {
        $elements.push($('<span></span>').appendTo($c));
      }
      for (let i = 0; i < 50; i++) {
        const val = `update-${i}`;
        for (let j = 0; j < 100; j++) {
          $elements[j]?.text(val);
        }
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'atom-effect: update text (100 elements x 50 updates)',
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
    'atom-effect: update html (100 elements x 20 updates)',
    () => {
      const $c = createContainer();
      const source = $.atom('<em>initial</em>');
      for (let i = 0; i < 100; i++) {
        $('<div></div>').appendTo($c).atomHtml(source);
      }
      for (let i = 0; i < 20; i++) {
        source.value = `<strong>update-${i}</strong>`;
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'atom-effect: toggle class (100 elements x 100 toggles)',
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

  bench(
    'atom-effect: update CSS (100 elements x 50 updates)',
    () => {
      const $c = createContainer();
      const width = $.atom(100);
      for (let i = 0; i < 100; i++) {
        $('<div></div>').appendTo($c).atomCss('width', width, 'px');
      }
      for (let i = 0; i < 50; i++) {
        width.value = 100 + i;
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'atom-effect: toggle visibility (100 elements x 50 toggles)',
    () => {
      const $c = createContainer();
      const visible = $.atom(true);
      for (let i = 0; i < 100; i++) {
        $('<div></div>').appendTo($c).atomShow(visible);
      }
      for (let i = 0; i < 50; i++) {
        visible.value = !visible.value;
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

// ============================================================================
// 2. Two-way Bindings
// ============================================================================

describe('Bindings: Two-way (Input/Checked)', () => {
  bench(
    'atom → DOM: input val (100 inputs x 100 updates)',
    () => {
      const $c = createContainer();
      const source = $.atom('initial');
      for (let i = 0; i < 100; i++) {
        $('<input type="text">').appendTo($c).atomVal(source);
      }
      for (let i = 0; i < 100; i++) {
        source.value = `value-${i}`;
      }
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
      for (let i = 0; i < 100; i++) {
        $('<input type="checkbox">').appendTo($c).atomChecked(checked);
      }
      for (let i = 0; i < 100; i++) {
        checked.value = !checked.value;
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'textarea val (100 textareas x 100 updates)',
    () => {
      const $c = createContainer();
      const source = $.atom('initial');
      for (let i = 0; i < 100; i++) {
        $('<textarea></textarea>').appendTo($c).atomVal(source);
      }
      for (let i = 0; i < 100; i++) {
        source.value = `value-${i}`;
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'select single option (100 selects x 100 updates)',
    () => {
      const $c = createContainer();
      const source = $.atom('opt-1');
      for (let i = 0; i < 100; i++) {
        const $select = $(
          '<select><option value="opt-1">O1</option><option value="opt-2">O2</option></select>'
        ).appendTo($c);
        $select.atomVal(source);
      }
      for (let i = 0; i < 100; i++) {
        source.value = i % 2 === 0 ? 'opt-2' : 'opt-1';
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'select multiple options (100 selects x 50 updates)',
    () => {
      const $c = createContainer();
      const source = $.atom<string[]>(['opt-1']);
      for (let i = 0; i < 100; i++) {
        const $select = $(
          '<select multiple><option value="opt-1">O1</option><option value="opt-2">O2</option><option value="opt-3">O3</option></select>'
        ).appendTo($c);
        $select.atomVal(source);
      }
      for (let i = 0; i < 50; i++) {
        source.value = i % 2 === 0 ? ['opt-1', 'opt-3'] : ['opt-2'];
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'radio check toggle (100 radio groups x 100 updates)',
    () => {
      const $c = createContainer();
      const source = $.atom('r1');
      for (let i = 0; i < 100; i++) {
        const $group = $('<div></div>').appendTo($c);
        $(`<input type="radio" name="group-${i}" value="r1">`).appendTo($group).atomVal(source);
        $(`<input type="radio" name="group-${i}" value="r2">`).appendTo($group).atomVal(source);
      }
      for (let i = 0; i < 100; i++) {
        source.value = i % 2 === 0 ? 'r2' : 'r1';
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

// ============================================================================
// 3. Composite and Unified Bindings
// ============================================================================

describe('Bindings: Unified (atomBind)', () => {
  bench(
    'sequential chain calls (text+class+css+show) x 100 elements',
    () => {
      const $c = createContainer();
      const text = $.atom('hello');
      const isActive = $.atom(true);
      const width = $.atom(100);
      for (let i = 0; i < 100; i++) {
        $('<div></div>')
          .appendTo($c)
          .atomText(text)
          .atomClass('active', isActive)
          .atomCss('width', width, 'px')
          .atomShow(isActive);
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'unified atomBind (text+class+css+show) x 100 elements',
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
// 4. Form Bindings
// ============================================================================

interface ProfileData {
  name: string;
  email: string;
  notifications: boolean;
  preferences: {
    theme: string;
    newsletter: boolean;
  };
}

describe('Bindings: Form (atomForm)', () => {
  const getInitialProfile = (): ProfileData => ({
    name: 'Alice',
    email: 'alice@example.com',
    notifications: true,
    preferences: {
      theme: 'dark',
      newsletter: false,
    },
  });

  const createFormHtml = (): string => `
    <form>
      <input type="text" name="name" />
      <input type="email" name="email" />
      <input type="checkbox" name="notifications" />
      <select name="preferences.theme">
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <input type="checkbox" name="preferences.newsletter" />
    </form>
  `;

  bench(
    'atomForm initial setup x 10 forms',
    () => {
      const $c = createContainer();
      const profile = $.atom<ProfileData>(getInitialProfile());
      const forms: JQuery[] = [];

      for (let i = 0; i < 10; i++) {
        const $f = $(createFormHtml()).appendTo($c);
        $f.atomForm(profile);
        forms.push($f);
      }

      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'atomForm update via state (10 forms x 50 updates)',
    () => {
      const $c = createContainer();
      const profile = $.atom<ProfileData>(getInitialProfile());
      for (let i = 0; i < 10; i++) {
        $(createFormHtml()).appendTo($c).atomForm(profile);
      }

      for (let i = 0; i < 50; i++) {
        profile.value = {
          name: `Name-${i}`,
          email: `email-${i}@example.com`,
          notifications: i % 2 === 0,
          preferences: {
            theme: i % 2 === 0 ? 'light' : 'dark',
            newsletter: i % 2 !== 0,
          },
        };
      }

      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'atomForm update via DOM trigger (10 forms x 50 events)',
    () => {
      const $c = createContainer();
      const profile = $.atom<ProfileData>(getInitialProfile());
      const inputs: JQuery[] = [];
      for (let i = 0; i < 10; i++) {
        const $f = $(createFormHtml()).appendTo($c).atomForm(profile);
        inputs.push($f.find('input[name="name"]'));
      }

      for (let i = 0; i < 50; i++) {
        const nextVal = `Typed-${i}`;
        for (let j = 0; j < 10; j++) {
          inputs[j]?.val(nextVal).trigger('input');
        }
      }

      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'atomForm setup with validation hooks x 10 forms',
    () => {
      const $c = createContainer();
      const profile = $.atom<ProfileData>(getInitialProfile());
      const validationRules = {
        name: (v: unknown) => (v ? true : 'Name is required'),
        email: (v: unknown) => (String(v).includes('@') ? true : 'Invalid email'),
      };

      for (let i = 0; i < 10; i++) {
        const $f = $(createFormHtml()).appendTo($c);
        $f.atomForm(profile, { validation: validationRules });
      }

      cleanupContainer($c);
    },
    microBenchOptions
  );
});
