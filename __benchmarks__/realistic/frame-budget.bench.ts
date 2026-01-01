import { bench, describe } from 'vitest';
import { atom, computed, effect } from '../../src/index.js';

describe('Frame Budget (16ms)', () => {
    bench('updates per frame', () => {
        const atoms = Array.from({ length: 100 }, () => atom(0));
        const computed1 = computed(() => atoms.reduce((s, a) => s + a.value, 0));

        effect(() => {
            // Force read
            const _ = computed1.value;
        });

        const start = performance.now();
        let updates = 0;

        // Run as many updates as possible in ~16ms
        // Note: In a real benchmark runner like tinybench, this might be tricky because
        // the benchmark function itself is timed.
        // However, we can measure "how long N updates take" or "how many updates in fixed time".
        // Here we simulate a frame workload and return the count, but standard
        // benchmarking frameworks usually measure the *duration* of the function.
        // So we will fix the number of updates to a reasonable high number and measure time,
        // OR we try to fit in 16ms.
        // For a standard benchmark, it's better to process a fixed batch and see if it's fast enough.
        // But the user requested "updates per frame".

        // Let's try to simulate a heavy frame workload.
        // We will perform a fixed number of updates that represents a "heavy" frame
        // and see how fast it is (ops/sec -> implies frame time).
        
        // Let's update 100 atoms effectively.
        for (let i = 0; i < 100; i++) {
            atoms[i].value++;
        }
    });
});
