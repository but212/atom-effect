import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { atom, computed, effect } from '../../src';

describe('DOM Integration', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should update text content reactively', async () => {
    const text = atom('Hello');
    const element = document.createElement('span');
    container.appendChild(element);

    effect(() => {
      element.textContent = text.value;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(element.textContent).toBe('Hello');

    text.value = 'World';
    // Effects are scheduled on microtask queue
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(element.textContent).toBe('World');
  });

  it('should update attributes based on computed values', async () => {
    const isActive = atom(false);
    const className = computed(() => (isActive.value ? 'active' : 'inactive'));

    const element = document.createElement('div');
    container.appendChild(element);

    effect(() => {
      element.className = className.value;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(element.className).toBe('inactive');

    isActive.value = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(element.className).toBe('active');
  });

  it('should handle two-way binding simulation', async () => {
    const inputValue = atom('');
    const input = document.createElement('input');
    container.appendChild(input);

    // View -> Model
    input.addEventListener('input', (e) => {
      inputValue.value = (e.target as HTMLInputElement).value;
    });

    // Model -> View
    effect(() => {
      input.value = inputValue.value;
    });

    // Initial run
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Test Model -> View
    inputValue.value = 'Initial';
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(input.value).toBe('Initial');

    // Test View -> Model
    input.value = 'Updated';
    input.dispatchEvent(new Event('input'));
    // Listener updates atom sync, but effect might update back async?
    // Actually the listener sync updates atom, which schedules effect.
    expect(inputValue.value).toBe('Updated');

    // Wait for effect to settle (it will set input.value to 'Updated' again)
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(input.value).toBe('Updated');
  });
});
