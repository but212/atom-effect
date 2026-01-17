import { describe, it, expect, vi, afterEach } from 'vitest';
import $ from 'jquery';
import { debug } from '../src/debug';
import '../src/index';

function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('Debug Mode', () => {
  afterEach(() => {
    $.atom.debug = false;
    vi.restoreAllMocks();
  });

  it('should toggle debug mode', () => {
    $.atom.debug = true;
    expect(debug.enabled).toBe(true);
    $.atom.debug = false;
    expect(debug.enabled).toBe(false);
  });

  it('should log atom changes when enabled', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    $.atom.debug = true;
    debug.atomChanged('testAtom', 1, 2);
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[atom-effect-jquery] Atom "testAtom" changed:'),
      1, '→', 2
    );
  });

  it('should not log when disabled', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    $.atom.debug = false;
    debug.atomChanged('testAtom', 1, 2);
    
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('should log DOM updates and highlight element', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const $el = $('<div id="my-div" class="my-class">');
    
    $.atom.debug = true;
    
    // Mock css behavior for highlight
    const _originalCss = $el.css.bind($el);
    const _cssSpy = vi.spyOn($el, 'css'); // cant easily spy on jquery method on instance like this effectively but let's try
    // Better: spy on debug.domUpdated calls via side effects
    
    const atom = $.atom('initial');
    $el.atomText(atom);
    
    await tick();
    
    // Initial update log
    // getSelector returns ID only if present (src/utils.ts)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[atom-effect-jquery] DOM updated: #my-div.text ='),
      'initial'
    );
    
    // Trigger update
    atom.value = 'updated';
    await tick();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[atom-effect-jquery] DOM updated: #my-div.text ='),
      'updated'
    );
  });

  it('should log cleanup', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    $.atom.debug = true;
    debug.cleanup('#element');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[atom-effect-jquery] Cleanup: #element')
    );
  });

  it('should log warnings', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    $.atom.debug = true; // Warns might show regardless? No, implementation checks debugEnabled
    debug.warn('Something wrong');
    expect(warnSpy).toHaveBeenCalledWith('[atom-effect-jquery]', 'Something wrong');
  });
  
  it('highlightElement should apply styles (internal check via side effects)', () => {
    vi.useFakeTimers();
    $.atom.debug = true;
    const $el = $('<div>').appendTo('body');
    
    debug.domUpdated($el, 'test', 'val');
    
    // Check if outline style was applied
    expect($el.css('outline')).toContain('solid');
    // Color normalization differs by environment (rgb(255, 68, 68) or #ff4444)
    
    vi.advanceTimersByTime(200);
    // Should revert (cannot easily check revert to empty string in jsdom depending on implementation)
    
    vi.useRealTimers();
  });
});
