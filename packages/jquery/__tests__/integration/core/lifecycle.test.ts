import { beforeEach, describe, expect, it, vi } from 'vitest';
import $ from '@/index';
import { setupDOMCleanup } from '../../utils/test-helpers';

describe('Core DOM Lifecycle', () => {
  const { appendToBody } = setupDOMCleanup();

  it('should maintain reactivity after DOM reparenting', async () => {
    const count = $.atom(0);
    const $parent1 = appendToBody('<div id="parent1">');
    const $parent2 = appendToBody('<div id="parent2">');
    const $element = $('<div id="reactive-element">').appendTo($parent1);

    $element.atomText(count);

    await $.nextTick();
    expect($element.text()).toBe('0');
    expect($parent1.find('#reactive-element').length).toBe(1);

    // Reparent to parent2
    $element.appendTo($parent2);
    await $.nextTick();
    expect($parent1.find('#reactive-element').length).toBe(0);
    expect($parent2.find('#reactive-element').length).toBe(1);

    // Update atom
    count.value = 1;
    await $.nextTick();
    expect($element.text()).toBe('1');
  });

  it('should clean up reactive effects on native removal after being detached and re-attached', async () => {
    $.initAEJ({ patch: true, autoCleanup: true });
    const count = $.atom('initial');
    const $parent = appendToBody('<div id="parent"></div>');
    const $element = $('<div id="item"></div>').appendTo($parent);
    $element.atomText(count);

    await $.nextTick();
    expect($element.text()).toBe('initial');

    // 1. Detach (sparing the element from disposal)
    $element.detach();

    // Allow auto-cleanup observer tick to process removal while detached
    await $.nextTick();

    // Atom update should still work while detached (resources were preserved)
    count.value = 'detached-update';
    await $.nextTick();
    expect($element.text()).toBe('detached-update');

    // 2. Re-attach to DOM
    $element.appendTo($parent);
    await $.nextTick();

    // 3. Native removal (bypassing jQuery .remove(), invoking autoCleanup observer)
    $element[0]?.remove();

    // Allow auto-cleanup observer tick to process native removal
    await vi.waitFor(() => {
      count.value = 'after-remove';
      return $element.text() !== 'after-remove';
    });

    // Reactive effect should have been terminated
    expect($element.text()).toBe('detached-update');
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
