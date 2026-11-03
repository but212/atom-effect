import { describe, test } from 'vitest';
import { SlotBuffer } from '../dist';
import { keep, REPEATS } from './setup';

const LARGE_SIZE = 100;

describe('SlotBuffer', () => {
  const repeats = REPEATS;
  const _keep = keep;
  const BufferClass = SlotBuffer;

  test('push operations comparison', async ({ bench }) => {
    await bench.compare(
      bench(`push (small, x${repeats})`, () => {
        const buffer = new BufferClass<number>();
        for (let i = 0; i < repeats; i++) {
          _keep(buffer.push(i));
        }
      }),
      bench('push (large, x10)', () => {
        const buffer = new BufferClass<number>();
        for (let i = 0; i < LARGE_SIZE; i++) {
          for (let j = 0; j < 10; j++) {
            _keep(buffer.push(j));
          }
        }
      })
    );
  });

  test('read, iterate and scan operations', async ({ bench }) => {
    const filledBuffer = new BufferClass<number>();
    for (let i = 0; i < LARGE_SIZE; i++) filledBuffer.push(i);

    const isFive = (value: number) => value === 5;
    const isNinetyNine = (value: number) => value === 99;

    await bench.compare(
      bench(`has (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          _keep(filledBuffer.has(50));
        }
      }),
      bench(`forEach (x${repeats})`, () => {
        let sum = 0;
        const add = (value: number) => {
          sum += value;
        };
        for (let i = 0; i < repeats; i++) {
          filledBuffer.forEach(add);
        }
        _keep(sum);
      }),
      bench(`compact (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          const buffer = new BufferClass<number>();
          for (let j = 0; j < 10; j++) buffer.push(j);
          buffer.remove(2);
          buffer.remove(5);
          buffer.remove(8);
          buffer.compact();
        }
      }),
      bench(`some (early exit, x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          _keep(filledBuffer.some(isFive));
        }
      }),
      bench(`some (full scan, x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          _keep(filledBuffer.some(isNinetyNine));
        }
      })
    );
  });

  test('fragmentation and slot reallocation', async ({ bench }) => {
    await bench.compare(
      bench(`interleaved remove and re-push (x${repeats})`, () => {
        const buffer = new BufferClass<{ id: number }>();
        const items = Array.from({ length: 50 }, (_, i) => ({ id: i }));
        for (const item of items) buffer.push(item);

        for (let i = 0; i < repeats; i++) {
          // Remove even slots to create fragmentation
          for (let j = 0; j < 50; j += 2) {
            const item = items[j];
            if (item) buffer.remove(item);
          }
          // Re-insert new items
          for (let j = 0; j < 50; j += 2) {
            const nextItem = { id: j + i };
            items[j] = nextItem;
            buffer.push(nextItem);
          }
        }
        _keep(buffer.size);
      }),
      bench(`churn: fill and drain odd slots with compact (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          const buffer = new BufferClass<{ id: number }>();
          const items = Array.from({ length: 100 }, (_, j) => ({ id: j }));
          for (const item of items) buffer.push(item);
          for (let j = 1; j < 100; j += 2) {
            const item = items[j];
            if (item) buffer.remove(item);
          }
          buffer.compact();
          _keep(buffer.size);
        }
      })
    );
  });
});
