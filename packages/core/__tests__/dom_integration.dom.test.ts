import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { atom, computed, effect } from '../src';

describe('DOM Integration', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should update text content, attributes, styles and classes reactively', async () => {
    const text = atom('Hello');
    const isActive = atom(false);
    const x = atom(0);
    const className = computed(() => (isActive.value ? 'active' : 'inactive'));

    const element = document.createElement('div');
    container.appendChild(element);

    effect(() => {
      element.textContent = text.value;
      element.className = className.value;
      element.style.transform = `translate(${x.value}px, 0px)`;
      element.classList.toggle('highlight', isActive.value);
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(element.textContent).toBe('Hello');
    expect(element.className).toBe('inactive');
    expect(element.style.transform).toBe('translate(0px, 0px)');

    text.value = 'World';
    isActive.value = true;
    x.value = 100;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(element.textContent).toBe('World');
    expect(element.className).toContain('active');
    expect(element.style.transform).toBe('translate(100px, 0px)');
    expect(element.classList.contains('highlight')).toBe(true);
  });

  it('should handle two-way form bindings (input, checkbox, radio, select)', async () => {
    // 1. Text Input
    const inputValue = atom('');
    const input = document.createElement('input');
    input.addEventListener('input', (e) => {
      inputValue.value = (e.target as HTMLInputElement).value;
    });
    effect(() => {
      input.value = inputValue.value;
    });
    container.appendChild(input);

    // 2. Checkbox
    const isChecked = atom(false);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.addEventListener('change', () => {
      isChecked.value = checkbox.checked;
    });
    effect(() => {
      checkbox.checked = isChecked.value;
    });
    container.appendChild(checkbox);

    // 3. Select
    const selection = atom('B');
    const select = document.createElement('select');
    ['A', 'B'].forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.text = v;
      select.appendChild(opt);
    });
    select.addEventListener('change', (e) => {
      selection.value = (e.target as HTMLSelectElement).value;
    });
    effect(() => {
      select.value = selection.value;
    });
    container.appendChild(select);

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Test Model -> View
    inputValue.value = 'Initial';
    isChecked.value = true;
    selection.value = 'A';
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(input.value).toBe('Initial');
    expect(checkbox.checked).toBe(true);
    expect(select.value).toBe('A');

    // Test View -> Model
    input.value = 'Updated';
    input.dispatchEvent(new Event('input'));
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    select.value = 'B';
    select.dispatchEvent(new Event('change'));

    expect(inputValue.value).toBe('Updated');
    expect(isChecked.value).toBe(false);
    expect(selection.value).toBe('B');
  });

  it('should handle conditional and list rendering', async () => {
    const show = atom(true);
    const items = atom(['Apple', 'Banana']);
    const ul = document.createElement('ul');
    container.appendChild(ul);

    effect(() => {
      if (show.value) {
        ul.innerHTML = '';
        items.value.forEach((item) => {
          const li = document.createElement('li');
          li.textContent = item;
          ul.appendChild(li);
        });
        if (!ul.parentNode) container.appendChild(ul);
      } else if (ul.parentNode) {
        container.removeChild(ul);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ul.children.length).toBe(2);

    // Update list
    items.value = [...items.value, 'Cherry'];
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ul.children.length).toBe(3);

    // Conditional toggle
    show.value = false;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.contains(ul)).toBe(false);
  });
});
