import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { atom, effect } from '../../src';

describe('DOM List Rendering', () => {
  let container: HTMLDivElement;
  let ul: HTMLUListElement;

  beforeEach(() => {
    container = document.createElement('div');
    ul = document.createElement('ul');
    container.appendChild(ul);
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should render initial list items', async () => {
    const items = atom(['Apple', 'Banana', 'Cherry']);

    effect(() => {
      ul.innerHTML = ''; // Efficient-ish clear
      items.value.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        ul.appendChild(li);
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const lis = ul.querySelectorAll('li');
    expect(lis.length).toBe(3);
    expect(lis[0].textContent).toBe('Apple');
    expect(lis[1].textContent).toBe('Banana');
    expect(lis[2].textContent).toBe('Cherry');
  });

  it('should update list when item added', async () => {
    const items = atom(['Apple']);

    effect(() => {
      ul.innerHTML = '';
      items.value.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        ul.appendChild(li);
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ul.children.length).toBe(1);

    items.value = [...items.value, 'Banana']; // Immutable update
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ul.children.length).toBe(2);
    expect(ul.children[1].textContent).toBe('Banana');
  });

  it('should update list when item removed', async () => {
    const items = atom(['Apple', 'Banana']);

    effect(() => {
      ul.innerHTML = '';
      items.value.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        ul.appendChild(li);
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ul.children.length).toBe(2);

    items.value = items.value.filter((i) => i !== 'Banana');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ul.children.length).toBe(1);
    expect(ul.children[0].textContent).toBe('Apple');
  });
});
