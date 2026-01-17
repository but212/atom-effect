import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { atom, effect } from '../../src';

describe('DOM Conditional Rendering', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should conditionally render element based on boolean', async () => {
    const show = atom(true);
    const element = document.createElement('div');
    element.id = 'target';

    effect(() => {
      if (show.value) {
        if (!element.parentNode) {
          container.appendChild(element);
        }
      } else if (element.parentNode) {
        container.removeChild(element);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector('#target')).not.toBeNull();

    show.value = false;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector('#target')).toBeNull();

    show.value = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector('#target')).not.toBeNull();
  });

  it('should toggle between two elements', async () => {
    const mode = atom('view'); // 'view' | 'edit'

    effect(() => {
      container.innerHTML = '';
      if (mode.value === 'view') {
        const viewDiv = document.createElement('div');
        viewDiv.className = 'view-mode';
        container.appendChild(viewDiv);
      } else {
        const editInput = document.createElement('input');
        editInput.className = 'edit-mode';
        container.appendChild(editInput);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector('.view-mode')).not.toBeNull();
    expect(container.querySelector('.edit-mode')).toBeNull();

    mode.value = 'edit';
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector('.view-mode')).toBeNull();
    expect(container.querySelector('.edit-mode')).not.toBeNull();
  });
});
