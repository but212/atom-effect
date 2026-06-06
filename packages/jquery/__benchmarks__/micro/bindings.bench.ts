/**
 * @fileoverview Micro-benchmarks for jQuery bindings (one-way, two-way, form bindings).
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { microBenchOptions, withContainer } from '../utils/setup';

describe('Bindings: One-way & Baselines', () => {
  const run = (name: string, fn: ($c: JQuery) => void | Promise<void>) =>
    bench(name, withContainer(fn), microBenchOptions);

  run('Native: create 100 text nodes', ($c) => {
    const container = $c[0];
    if (!container) return;
    for (let i = 0; i < 100; i++) {
      container.appendChild(document.createElement('span')).textContent = 'hello';
    }
  });

  run('jQuery: create 100 text elements', ($c) => {
    for (let i = 0; i < 100; i++) {
      $('<span></span>').appendTo($c).text('hello');
    }
  });

  run('atom-effect: create 100 text bindings (atomText)', ($c) => {
    const source = $.atom('hello');
    for (let i = 0; i < 100; i++) {
      $('<span></span>').appendTo($c).atomText(source);
    }
  });

  run('atom-effect: create 100 HTML bindings (atomHtml)', ($c) => {
    const source = $.atom('<em>hello</em>');
    for (let i = 0; i < 100; i++) {
      $('<div></div>').appendTo($c).atomHtml(source);
    }
  });

  run('Native: update text (100 elements x 50 updates)', ($c) => {
    const container = $c[0];
    if (!container) return;
    const elements = Array.from({ length: 100 }, () =>
      container.appendChild(document.createElement('span'))
    );
    for (let i = 0; i < 50; i++) {
      const val = `update-${i}`;
      for (const el of elements) el.textContent = val;
    }
  });

  run('jQuery: update text (100 elements x 50 updates)', ($c) => {
    const elements = Array.from({ length: 100 }, () => $('<span></span>').appendTo($c));
    for (let i = 0; i < 50; i++) {
      const val = `update-${i}`;
      for (const el of elements) el.text(val);
    }
  });

  run('atom-effect: update text (100 elements x 50 updates)', ($c) => {
    const source = $.atom('initial');
    for (let i = 0; i < 100; i++) {
      $('<span></span>').appendTo($c).atomText(source);
    }
    for (let i = 0; i < 50; i++) {
      source.value = `update-${i}`;
    }
  });

  run('atom-effect: update html (100 elements x 20 updates)', ($c) => {
    const source = $.atom('<em>initial</em>');
    for (let i = 0; i < 100; i++) {
      $('<div></div>').appendTo($c).atomHtml(source);
    }
    for (let i = 0; i < 20; i++) {
      source.value = `<strong>update-${i}</strong>`;
    }
  });

  run('atom-effect: toggle class (100 elements x 100 toggles)', ($c) => {
    const condition = $.atom(false);
    for (let i = 0; i < 100; i++) {
      $('<div></div>').appendTo($c).atomClass('active', condition);
    }
    for (let i = 0; i < 100; i++) {
      condition.value = !condition.value;
    }
  });

  run('atom-effect: update CSS (100 elements x 50 updates)', ($c) => {
    const width = $.atom(100);
    for (let i = 0; i < 100; i++) {
      $('<div></div>').appendTo($c).atomCss('width', width, 'px');
    }
    for (let i = 0; i < 50; i++) {
      width.value = 100 + i;
    }
  });

  run('atom-effect: toggle visibility (100 elements x 50 toggles)', ($c) => {
    const visible = $.atom(true);
    for (let i = 0; i < 100; i++) {
      $('<div></div>').appendTo($c).atomShow(visible);
    }
    for (let i = 0; i < 50; i++) {
      visible.value = !visible.value;
    }
  });
});

describe('Bindings: Two-way & Unified', () => {
  const run = (name: string, fn: ($c: JQuery) => void | Promise<void>) =>
    bench(name, withContainer(fn), microBenchOptions);

  const valueUpdates100 = Array.from({ length: 100 }, (_, i) => `value-${i}`);

  run('atom → DOM: input val (100 inputs x 100 updates)', ($c) => {
    const source = $.atom('initial');
    for (let i = 0; i < 100; i++) {
      $('<input type="text">').appendTo($c).atomVal(source);
    }
    for (const val of valueUpdates100) {
      source.value = val;
    }
  });

  run('DOM → atom: input val (trigger 100 events)', ($c) => {
    const source = $.atom('initial');
    const $input = $('<input type="text">').appendTo($c).atomVal(source);
    for (let i = 0; i < 100; i++) {
      $input.val(`typed-${i}`).trigger('input');
    }
  });

  run('checkbox toggle (100 elements x 100 toggles)', ($c) => {
    const checked = $.atom(false);
    for (let i = 0; i < 100; i++) {
      $('<input type="checkbox">').appendTo($c).atomChecked(checked);
    }
    for (let i = 0; i < 100; i++) {
      checked.value = !checked.value;
    }
  });

  run('textarea val (100 textareas x 100 updates)', ($c) => {
    const source = $.atom('initial');
    for (let i = 0; i < 100; i++) {
      $('<textarea></textarea>').appendTo($c).atomVal(source);
    }
    for (const val of valueUpdates100) {
      source.value = val;
    }
  });

  run('select single option (100 selects x 100 updates)', ($c) => {
    const source = $.atom('opt-1');
    for (let i = 0; i < 100; i++) {
      $('<select><option value="opt-1">O1</option><option value="opt-2">O2</option></select>')
        .appendTo($c)
        .atomVal(source);
    }
    for (let i = 0; i < 100; i++) {
      source.value = i % 2 === 0 ? 'opt-2' : 'opt-1';
    }
  });

  run('select multiple options (100 selects x 50 updates)', ($c) => {
    const source = $.atom<string[]>(['opt-1']);
    for (let i = 0; i < 100; i++) {
      $(
        '<select multiple><option value="opt-1">O1</option><option value="opt-2">O2</option><option value="opt-3">O3</option></select>'
      )
        .appendTo($c)
        .atomVal(source);
    }
    for (let i = 0; i < 50; i++) {
      source.value = i % 2 === 0 ? ['opt-1', 'opt-3'] : ['opt-2'];
    }
  });

  run('radio check toggle (100 radio groups x 100 updates)', ($c) => {
    const source = $.atom('r1');
    for (let i = 0; i < 100; i++) {
      const $group = $('<div></div>').appendTo($c);
      $(`<input type="radio" name="group-${i}" value="r1">`).appendTo($group).atomVal(source);
      $(`<input type="radio" name="group-${i}" value="r2">`).appendTo($group).atomVal(source);
    }
    for (let i = 0; i < 100; i++) {
      source.value = i % 2 === 0 ? 'r2' : 'r1';
    }
  });

  run('sequential chain calls (text+class+css+show) x 100 elements', ($c) => {
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
  });

  run('unified atomBind (text+class+css+show) x 100 elements', ($c) => {
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
  });
});

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
  const run = (name: string, fn: ($c: JQuery) => void | Promise<void>) =>
    bench(name, withContainer(fn), microBenchOptions);

  const getInitialProfile = (): ProfileData => ({
    name: 'Alice',
    email: 'alice@example.com',
    notifications: true,
    preferences: { theme: 'dark', newsletter: false },
  });

  const profileUpdates: ProfileData[] = Array.from({ length: 50 }, (_, i) => ({
    name: `Name-${i}`,
    email: `email-${i}@example.com`,
    notifications: i % 2 === 0,
    preferences: { theme: i % 2 === 0 ? 'light' : 'dark', newsletter: i % 2 !== 0 },
  }));

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

  run('atomForm initial setup x 10 forms', ($c) => {
    const profile = $.atom<ProfileData>(getInitialProfile());
    for (let i = 0; i < 10; i++) {
      $(createFormHtml()).appendTo($c).atomForm(profile);
    }
  });

  run('atomForm update via state (10 forms x 50 updates)', ($c) => {
    const profile = $.atom<ProfileData>(getInitialProfile());
    for (let i = 0; i < 10; i++) {
      $(createFormHtml()).appendTo($c).atomForm(profile);
    }
    for (const val of profileUpdates) {
      profile.value = val;
    }
  });

  run('atomForm update via DOM trigger (10 forms x 50 events)', ($c) => {
    const profile = $.atom<ProfileData>(getInitialProfile());
    const inputs: JQuery[] = [];
    for (let i = 0; i < 10; i++) {
      inputs.push($(createFormHtml()).appendTo($c).atomForm(profile).find('input[name="name"]'));
    }
    for (let i = 0; i < 50; i++) {
      const nextVal = `Typed-${i}`;
      for (let j = 0; j < 10; j++) {
        inputs[j]?.val(nextVal).trigger('input');
      }
    }
  });

  run('atomForm setup with validation hooks x 10 forms', ($c) => {
    const profile = $.atom<ProfileData>(getInitialProfile());
    const validationRules = {
      name: (v: unknown) => (v ? true : 'Name is required'),
      email: (v: unknown) => (String(v).includes('@') ? true : 'Invalid email'),
    };
    for (let i = 0; i < 10; i++) {
      $(createFormHtml()).appendTo($c).atomForm(profile, { validation: validationRules });
    }
  });
});
