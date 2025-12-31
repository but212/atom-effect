import { createRoot, createSignal } from 'solid-js';
import { runBenchmark } from '../utils/benchmark-runner';
import { setupDOM, teardownDOM } from '../utils/dom-helpers';
import { atom } from '../utils/import-lib';

export async function runDOMEventBenchmark() {
  setupDOM();

  // Verification
  {
    const btn = document.createElement('button');
    let count = 0;
    const handler = () => count++;
    btn.addEventListener('click', handler);
    btn.dispatchEvent(new window.Event('click'));
    if (count !== 1) console.warn('⚠️ Verification failed: Vanilla event dispatch');

    const atomCount = atom(0);
    const atomHandler = () => atomCount.value++;
    btn.addEventListener('click', atomHandler);
    btn.dispatchEvent(new window.Event('click'));
    if (atomCount.value !== 1) console.warn('⚠️ Verification failed: Reactive event dispatch');
  }

  await runBenchmark(
    'DOM Events',
    {
      'Vanilla JS: Dispatch 1000 events': () => {
        let count = 0;
        const btn = document.createElement('button');
        const handler = () => {
          count++;
        };
        btn.addEventListener('click', handler);

        for (let i = 0; i < 1000; i++) {
          btn.dispatchEvent(new window.Event('click'));
        }

        btn.removeEventListener('click', handler);
      },

      'Reactive: Dispatch 1000 events': () => {
        const count = atom(0);
        const btn = document.createElement('button');
        const handler = () => {
          count.value++;
        };
        btn.addEventListener('click', handler);

        for (let i = 0; i < 1000; i++) {
          btn.dispatchEvent(new window.Event('click'));
        }

        btn.removeEventListener('click', handler);
      },

      'SolidJS: Dispatch 1000 events': () => {
        const btn = document.createElement('button');
        createRoot((dispose: () => void) => {
          const [count, setCount] = createSignal(0);
          const handler = () => {
            setCount((c: number) => c + 1);
          };
          btn.addEventListener('click', handler);

          for (let i = 0; i < 1000; i++) {
            btn.dispatchEvent(new window.Event('click'));
          }

          btn.removeEventListener('click', handler);
          dispose();
        });
      },
    },
    { time: 500, iterations: 50 }
  );

  teardownDOM();
}
