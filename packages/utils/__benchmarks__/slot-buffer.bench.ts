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
});
