import { describe, it, expect } from 'vitest';
import $ from 'jquery';
import '../src/index';

function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('Namespace', () => {
  it('should create atom via $.atom', () => {
    const a = $.atom(10);
    expect(a.value).toBe(10);
    a.value = 20;
    expect(a.value).toBe(20);
  });

  it('should create computed via $.computed', async () => {
    const a = $.atom(1);
    const b = $.computed(() => a.value * 2);
    
    // Subscribe to ensure reactivity is active (if needed by atom-effect)
    const unsub = b.subscribe(() => {});
    
    expect(b.value).toBe(2);
    a.value = 2;
    await tick();
    expect(b.value).toBe(4);
    
    unsub();
  });
  
  it('should have debug mode toggle', () => {
    expect($.atom.debug).toBe(false);
    $.atom.debug = true;
    expect($.atom.debug).toBe(true);
    $.atom.debug = false;
  });
});
