import { beforeEach, describe, expect, it } from 'vitest';
import $ from '@/index';

describe('Core DOM Lifecycle', () => {
  it('should maintain reactivity after DOM reparenting', async () => {
    const count = $.atom(0);
    const $parent1 = $('<div id="parent1">').appendTo(document.body);
    const $parent2 = $('<div id="parent2">').appendTo(document.body);
    const $el = $('<div id="reactive-el">').appendTo($parent1);

    $el.atomText(count);

    await $.nextTick();
    expect($el.text()).toBe('0');
    expect($parent1.find('#reactive-el').length).toBe(1);

    // Reparent to parent2
    $el.appendTo($parent2);
    await $.nextTick();
    expect($parent1.find('#reactive-el').length).toBe(0);
    expect($parent2.find('#reactive-el').length).toBe(1);

    // Update atom
    count.value = 1;
    await $.nextTick();
    expect($el.text()).toBe('1');

    $parent1.remove();
    $parent2.remove();
  });

  describe('jQuery Batching Documentation Verification', () => {
    beforeEach(() => {
      document.body.innerHTML = '<div id="count">0</div><button id="btn"></button>';
    });

    it('VERIFY: Is DOM updated INSIDE the handler when wrapped in batch?', () => {
      const count = $.atom(0);
      $('#count').atomText(count);

      const $btn = $('#btn');
      let domValueInside = '';

      $btn.on('click', () => {
        count.value = 1;
        domValueInside = $('#count').text();
      });

      $btn.trigger('click');

      expect(domValueInside).toBe('0');
      expect($('#count').text()).toBe('1');
    });
  });
});
