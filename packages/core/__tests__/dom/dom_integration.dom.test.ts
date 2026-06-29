import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { aeNextTick, atom, computed, effect } from '@/index';

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
    const xOffset = atom(0);
    const className = computed(() => (isActive.value ? 'active' : 'inactive'));

    const element = document.createElement('div');
    container.appendChild(element);

    effect(() => {
      element.textContent = text.value;
      element.className = className.value;
      element.style.transform = `translate(${xOffset.value}px, 0px)`;
      element.classList.toggle('highlight', isActive.value);
    });

    await aeNextTick();
    expect(element.textContent).toBe('Hello');
    expect(element.className).toBe('inactive');
    expect(element.style.transform).toBe('translate(0px, 0px)');

    text.value = 'World';
    isActive.value = true;
    xOffset.value = 100;
    await aeNextTick();
    expect(element.textContent).toBe('World');
    expect(element.className).toContain('active');
    expect(element.style.transform).toBe('translate(100px, 0px)');
    expect(element.classList.contains('highlight')).toBe(true);
  });

  it('should handle two-way form bindings (input, checkbox, select)', async () => {
    // 1. Text Input
    const inputValue = atom('');
    const input = document.createElement('input');
    input.addEventListener('input', (event) => {
      inputValue.value = (event.target as HTMLInputElement).value;
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
    for (const value of ['A', 'B']) {
      const optionElement = document.createElement('option');
      optionElement.value = value;
      optionElement.text = value;
      select.appendChild(optionElement);
    }
    select.addEventListener('change', (event) => {
      selection.value = (event.target as HTMLSelectElement).value;
    });
    effect(() => {
      select.value = selection.value;
    });
    container.appendChild(select);

    await aeNextTick();

    // Model -> View
    inputValue.value = 'Initial';
    isChecked.value = true;
    selection.value = 'A';
    await aeNextTick();
    expect(input.value).toBe('Initial');
    expect(checkbox.checked).toBe(true);
    expect(select.value).toBe('A');

    // View -> Model
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
        for (const item of items.value) {
          const li = document.createElement('li');
          li.textContent = item;
          ul.appendChild(li);
        }
        if (!ul.parentNode) container.appendChild(ul);
      } else if (ul.parentNode) {
        container.removeChild(ul);
      }
    });

    await aeNextTick();
    expect(ul.children.length).toBe(2);

    items.value = [...items.value, 'Cherry'];
    await aeNextTick();
    expect(ul.children.length).toBe(3);

    show.value = false;
    await aeNextTick();
    expect(container.contains(ul)).toBe(false);
  });

  it('should stop updating DOM after dispose and run cleanup', async () => {
    const label = atom('on');
    const element = document.createElement('span');
    const button = document.createElement('button');
    container.appendChild(element);
    container.appendChild(button);

    let clickCount = 0;
    const handler = () => {
      clickCount++;
    };

    const effectInstance = effect(() => {
      element.textContent = label.value;
      button.addEventListener('click', handler);
      return () => button.removeEventListener('click', handler);
    });

    await aeNextTick();
    expect(element.textContent).toBe('on');
    button.click();
    expect(clickCount).toBe(1);

    effectInstance.dispose();

    // Cleanup ran — listener removed
    button.click();
    expect(clickCount).toBe(1);

    // DOM no longer updates
    label.value = 'off';
    await aeNextTick();
    expect(element.textContent).toBe('on');
  });

  it('should allow multiple independent effects on the same atom', async () => {
    const title = atom('init');
    const el1 = document.createElement('h1');
    const el2 = document.createElement('h2');
    container.appendChild(el1);
    container.appendChild(el2);

    const effect1 = effect(() => {
      el1.textContent = title.value;
    });
    effect(() => {
      el2.textContent = title.value.toUpperCase();
    });

    await aeNextTick();
    expect(el1.textContent).toBe('init');
    expect(el2.textContent).toBe('INIT');

    effect1.dispose();

    title.value = 'updated';
    await aeNextTick();

    expect(el1.textContent).toBe('init'); // disposed — unchanged
    expect(el2.textContent).toBe('UPDATED'); // still active
  });
});
