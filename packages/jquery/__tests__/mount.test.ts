import { describe, it, expect, vi } from 'vitest';
import $ from 'jquery';
import '../src/index';

function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('Component Mount', () => {
  it('should mount and cleanup component', async () => {
    const cleanup = vi.fn();
    const Component = ($el: JQuery, props: { title: string }) => {
        $el.text(props.title);
        return cleanup;
    };

    const $container = $('<div>').appendTo(document.body);
    $container.atomMount(Component, { title: 'Hello' });
    
    await tick(); // Just in case, though mount is synchronous usually
    expect($container.text()).toBe('Hello');

    // Unmount explicitly
    $container.atomUnmount();
    expect(cleanup).toHaveBeenCalled();

    // Mount again
    $container.atomMount(Component, { title: 'World' });
    expect($container.text()).toBe('World');
    
    // Remove element (implicit unmount via mutation observer)
    $container.remove();
    await new Promise(resolve => setTimeout(resolve, 50)); // Wait for mutation observer
    
    // Should have called cleanup twice (once explicit, once implicit)
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});
