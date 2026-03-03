import { beforeEach, bench, describe } from 'vitest';
import { atom, computed, effect } from '@/index';
import { benchEffectOptions } from '../utils/setup.js';

describe('Input Latency', () => {
  const mockData = Array.from({ length: 1000 }, (_, i) => `Item ${i}`);

  // Setup reactive graph once
  const searchQuery = atom('');
  const results = computed(() => mockData.filter((item) => item.includes(searchQuery.value)));
  const displayResults = computed(() =>
    results.value.slice(0, 20).map((item: string) => `<div class="item">${item}</div>`)
  );

  let _lastRender = '';
  effect(() => {
    _lastRender = displayResults.value.join('');
  }, benchEffectOptions);

  beforeEach(() => {
    // Reset state before each run
    searchQuery.value = '';
  });
  bench('input to render latency (pure propagation)', () => {
    // Simulate typing "Item 1"
    const input = 'Item 1';
    for (const char of input) {
      searchQuery.value += char;
    }
  });
});
