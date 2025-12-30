import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { atom, effect } from '../../src';

describe('DOM Form Binding', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should bind checkbox boolean value', async () => {
    const isChecked = atom(false);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    container.appendChild(checkbox);

    // View -> Model
    checkbox.addEventListener('change', () => {
      isChecked.value = checkbox.checked;
    });

    // Model -> View
    effect(() => {
      checkbox.checked = isChecked.value;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(checkbox.checked).toBe(false);

    // Model update
    isChecked.value = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(checkbox.checked).toBe(true);

    // View update
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    expect(isChecked.value).toBe(false);
  });

  it('should bind radio buttons', async () => {
    const selected = atom('A');
    const radioA = document.createElement('input');
    radioA.type = 'radio';
    radioA.name = 'choice';
    radioA.value = 'A';

    const radioB = document.createElement('input');
    radioB.type = 'radio';
    radioB.name = 'choice';
    radioB.value = 'B';

    container.appendChild(radioA);
    container.appendChild(radioB);

    const updateModel = (e: Event) => {
      if ((e.target as HTMLInputElement).checked) {
        selected.value = (e.target as HTMLInputElement).value;
      }
    };
    radioA.addEventListener('change', updateModel);
    radioB.addEventListener('change', updateModel);

    effect(() => {
      radioA.checked = selected.value === 'A';
      radioB.checked = selected.value === 'B';
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(radioA.checked).toBe(true);
    expect(radioB.checked).toBe(false);

    // View update
    radioB.checked = true;
    radioB.dispatchEvent(new Event('change')); // Only checked triggers change usually
    expect(selected.value).toBe('B');

    // Model update
    selected.value = 'A';
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(radioA.checked).toBe(true);
    expect(radioB.checked).toBe(false);
  });

  it('should bind select dropdown', async () => {
    const selection = atom('B');
    const select = document.createElement('select');
    const optionA = document.createElement('option');
    optionA.value = 'A';
    optionA.text = 'A';
    const optionB = document.createElement('option');
    optionB.value = 'B';
    optionB.text = 'B';

    select.appendChild(optionA);
    select.appendChild(optionB);
    container.appendChild(select);

    select.addEventListener('change', (e) => {
      selection.value = (e.target as HTMLSelectElement).value;
    });

    effect(() => {
      select.value = selection.value;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(select.value).toBe('B');

    // Model update
    selection.value = 'A';
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(select.value).toBe('A');

    // View update
    select.value = 'B';
    select.dispatchEvent(new Event('change'));
    expect(selection.value).toBe('B');
  });
});
