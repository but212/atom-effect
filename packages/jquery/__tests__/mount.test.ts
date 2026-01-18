import $ from 'jquery';
import { describe, expect, it, vi } from 'vitest';
import '../src/index';

describe('Atom Mount', () => {
  it('should mount and unmount components with cleanup', () => {
    const $el = $('<div>').appendTo(document.body);
    const cleanup = vi.fn();

    const Component = (el: JQuery) => {
      el.text('mounted');
      return cleanup;
    };

    $el.atomMount(Component);
    expect($el.text()).toBe('mounted');

    $el.atomUnmount();
    expect(cleanup).toHaveBeenCalled();

    $el.remove();
  });

  it('should unmount existing component when mounting a new one', () => {
    const $el = $('<div>').appendTo(document.body);
    const cleanup1 = vi.fn();

    $el.atomMount(() => {
      cleanup1();
      return undefined;
    });
    $el.atomMount(() => undefined); // Mount a second one

    expect(cleanup1).toHaveBeenCalled();

    $el.remove();
  });

  it('should handle errors in component function', () => {
    const $el = $('<div>').appendTo(document.body);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    $el.atomMount(() => {
      throw new Error('mount fail');
    });

    expect(consoleSpy).toHaveBeenCalledWith('[atom-effect-jquery] Mount error:', expect.any(Error));
    consoleSpy.mockRestore();
    $el.remove();
  });

  it('should handle cleanup functions that throw errors', () => {
    const $el = $('<div>').appendTo(document.body);
    $el.atomMount(() => () => {
      throw new Error('cleanup fail');
    });
    
    // Should not throw when unmounting
    expect(() => $el.atomUnmount()).not.throw();
    $el.remove();
  });
});
