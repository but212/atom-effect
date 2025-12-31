import { createEffect, createRenderEffect, createRoot, createSignal } from 'solid-js';
import { runBenchmark } from '../utils/benchmark-runner';
import { setupDOM, teardownDOM } from '../utils/dom-helpers';
import { atom, effect } from '../utils/import-lib';

export async function runDOMRenderBenchmark() {
  setupDOM();

  // Verification run
  {
    const items = atom([1, 2]);
    const container = document.createElement('div');
    const e = effect(
      () => {
        container.textContent = '';
        items.value.forEach((item: number) => {
          const el = document.createElement('div');
          el.textContent = `Item ${item}`;
          container.appendChild(el);
        });
      },
      { sync: true }
    );

    if (container.children.length !== 2) {
      console.warn('⚠️ Verification failed: Reactive render count mismatch');
    }
    e.dispose();
  }

  await runBenchmark(
    'DOM Rendering',
    {
      'Vanilla JS: Create 1000 items': () => {
        const container = document.createElement('div');
        for (let i = 0; i < 1000; i++) {
          const el = document.createElement('div');
          el.textContent = `Item ${i}`;
          container.appendChild(el);
        }
      },

      'Reactive: Create 1000 items': () => {
        const container = document.createElement('div');
        const items = atom(Array.from({ length: 1000 }, (_, i) => i));

        // Simple rendering effect
        const e = effect(() => {
          container.textContent = ''; // Clear
          items.value.forEach((item: number) => {
            const el = document.createElement('div');
            el.textContent = `Item ${item}`;
            container.appendChild(el);
          });
        });
        e.dispose();
      },

      'SolidJS: Create 1000 items': () => {
        const container = document.createElement('div');

        createRoot((dispose: () => void) => {
          const [items] = createSignal(Array.from({ length: 1000 }, (_, i) => i));

          createRenderEffect(() => {
            container.textContent = '';
            items().forEach((item: number) => {
              const el = document.createElement('div');
              el.textContent = `Item ${item}`;
              container.appendChild(el);
            });
          });

          dispose();
        });
      },
    },
    { time: 500, iterations: 100 }
  );

  teardownDOM();
}
