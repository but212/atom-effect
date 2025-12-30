import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { atom, computed, effect } from '../../src';

describe('DOM Style and Class', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should toggle classes based on computed values', async () => {
    const isActive = atom(false);
    const isDisabled = atom(false);

    const classList = computed(() => {
      const classes = ['btn'];
      if (isActive.value) classes.push('active');
      if (isDisabled.value) classes.push('disabled');
      return classes.join(' ');
    });

    const element = document.createElement('button');
    container.appendChild(element);

    effect(() => {
      element.className = classList.value;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(element.className).toBe('btn');

    isActive.value = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(element.className).toBe('btn active');

    isDisabled.value = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(element.className).toBe('btn active disabled');
  });

  it('should update inline styles', async () => {
    const x = atom(0);
    const y = atom(0);

    const element = document.createElement('div');
    container.appendChild(element);

    effect(() => {
      element.style.transform = `translate(${x.value}px, ${y.value}px)`;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(element.style.transform).toBe('translate(0px, 0px)');

    x.value = 100;
    y.value = 50;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(element.style.transform).toBe('translate(100px, 50px)');
  });
});
