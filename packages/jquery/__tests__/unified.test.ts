import { describe, it, expect } from 'vitest';
import $ from 'jquery';
import '../src/index';

describe('Unified Bind', () => {
  it('should bind multiple properties', async () => {
    const text = $.atom('initial');
    const isActive = $.atom(false);
    
    const $el = $('<div>').appendTo(document.body);
    $el.atomBind({
        text: text,
        class: { active: isActive }
    });

    await $.nextTick();
    expect($el.text()).toBe('initial');
    expect($el.hasClass('active')).toBe(false);

    text.value = 'updated';
    isActive.value = true;
    await $.nextTick();
    expect($el.text()).toBe('updated');
    expect($el.hasClass('active')).toBe(true);
    
    $el.remove();
  });
});
