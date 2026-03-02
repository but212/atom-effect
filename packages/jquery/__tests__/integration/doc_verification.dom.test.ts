import $ from 'jquery';
import { beforeEach, describe, expect, it } from 'vitest';
import '../../src/index';
import { atom } from '@but212/atom-effect';

describe('jQuery Batching Documentation Verification', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="count">0</div><button id="btn"></button>';
  });

  it('VERIFY: Is DOM updated INSIDE the handler when wrapped in batch?', () => {
    const count = atom(0);
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
