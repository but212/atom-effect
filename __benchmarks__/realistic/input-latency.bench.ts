import { bench, describe } from 'vitest';
import { atom, computed, effect } from '../../src/index.js';

describe('Input Latency', () => {
    // Setup mock data once
    const mockData = Array.from({ length: 1000 }, (_, i) => `Item ${i}`);

    bench('input to render latency', async () => {
        const searchQuery = atom('');
        const results = computed(() =>
            mockData.filter(item => item.includes(searchQuery.value))
        );
        const displayResults = computed(() =>
            results.value.slice(0, 20).map(item => `<div class="item">${item}</div>`)
        );

        let lastRender = '';
        effect(() => {
            lastRender = displayResults.value.join('');
        });

        // Simulate typing "Item 1"
        const input = "Item 1";
        for (const char of input) {
            searchQuery.value += char;
            // In a real app we might await nextTick() here if using a framework scheduler
            // Here we assume synchronous propagation or microtask
        }
    });
});
