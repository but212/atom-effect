import { describe, it, expect } from 'vitest';
import $ from 'jquery';
import '../src/index';

describe('Chainable Methods', () => {
  it('atomText should bind text', async () => {
    const text = $.atom('initial');
    const $el = $('<div>').appendTo(document.body);
    $el.atomText(text);

    await $.nextTick();
    expect($el.text()).toBe('initial');

    text.value = 'updated';
    await $.nextTick();
    expect($el.text()).toBe('updated');
    $el.remove();
  });

  it('atomClass should bind class', async () => {
    const isActive = $.atom(false);
    const $el = $('<div>').appendTo(document.body);
    $el.atomClass('active', isActive);

    await $.nextTick();
    expect($el.hasClass('active')).toBe(false);

    isActive.value = true;
    await $.nextTick();
    expect($el.hasClass('active')).toBe(true);
    $el.remove();
  });

  it('atomAttr should bind attributes', async () => {
    const src = $.atom('img.jpg');
    const $el = $('<img>').appendTo(document.body);
    $el.atomAttr('src', src);

    await $.nextTick();
    expect($el.attr('src')).toBe('img.jpg');

    src.value = 'new.jpg';
    await $.nextTick();
    expect($el.attr('src')).toBe('new.jpg');
    $el.remove();
  });

  it('atomText should work with computed', async () => {
    const count = $.atom(1);
    const doubled = $.computed(() => count.value * 2);
    const $el = $('<div>').appendTo(document.body);
    
    // Explicit subscription to wake up computed if lazy
    // doubled.subscribe(() => {}); 

    $el.atomText(doubled);
    
    await $.nextTick();
    expect($el.text()).toBe('2');
    
    count.value = 2;
    await $.nextTick();
    expect($el.text()).toBe('4');
    $el.remove();
  });
});
