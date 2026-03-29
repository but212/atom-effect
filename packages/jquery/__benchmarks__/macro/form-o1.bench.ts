/**
 * @fileoverview jQuery atomForm O(1) performance benchmark
 * @description Verifies that updating one field in a large form does not scale with formal size.
 */

import { afterAll, bench, describe } from 'vitest';
import $ from '@/index';
import { cleanupContainer, createContainer, macroBenchOptions } from '../utils/setup';

describe('atomForm: O(1) Scaling', () => {
  const $c = createContainer();
  afterAll(() => cleanupContainer($c));

  const createForm = (fieldCount: number) => {
    const $form = $('<form></form>').appendTo($c);
    const initialData: Record<string, string> = {};
    for (let i = 0; i < fieldCount; i++) {
      const name = `field${i}`;
      $(`<input name="${name}" />`).appendTo($form);
      initialData[name] = `value${i}`;
    }
    const formAtom = $.atom(initialData);
    $form.atomForm(formAtom);
    return { $form, formAtom };
  };

  const form10 = createForm(10);
  const form100 = createForm(100);

  const REPEATS = 1000;

  bench(
    `Update 1 field in 10-field form (x${REPEATS})`,
    () => {
      const { formAtom } = form10;
      for (let i = 0; i < REPEATS; i++) {
        formAtom.value = { ...formAtom.peek(), field0: `v${i}` };
      }
    },
    macroBenchOptions
  );

  bench(
    `Update 1 field in 100-field form (O(1) comparison) (x${REPEATS})`,
    () => {
      const { formAtom } = form100;
      for (let i = 0; i < REPEATS; i++) {
        formAtom.value = { ...formAtom.peek(), field0: `v${i}` };
      }
    },
    macroBenchOptions
  );
});
