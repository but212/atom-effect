import { bench, describe } from 'vitest';
import { SlotBuffer } from '../dist';
import { keep, REPEATS } from './setup';

const LARGE_SIZE = 100;

describe('SlotBuffer', () => {
  bench(`push (small, x${REPEATS})`, () => {
    const buffer = new SlotBuffer<number>();
    for (let i = 0; i < REPEATS; i++) {
      keep(buffer.push(i));
    }
  });

  bench(`push (large, x10)`, () => {
    const buffer = new SlotBuffer<number>();
    for (let i = 0; i < LARGE_SIZE; i++) {
      for (let j = 0; j < 10; j++) {
        keep(buffer.push(j));
      }
    }
  });

  const filledBuffer = new SlotBuffer<number>();
  for (let i = 0; i < LARGE_SIZE; i++) filledBuffer.push(i);

  bench(`has (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(filledBuffer.has(50));
    }
  });

  bench(`forEach (x${REPEATS})`, () => {
    let sum = 0;
    for (let i = 0; i < REPEATS; i++) {
      // biome-ignore lint/complexity/noForEach: Benchmarking SlotBuffer.forEach method performance
      filledBuffer.forEach((val) => {
        sum += val;
      });
    }
    keep(sum);
  });

  bench(`compact (x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      const buffer = new SlotBuffer<number>();
      for (let j = 0; j < 10; j++) buffer.push(j);
      buffer.remove(2);
      buffer.remove(5);
      buffer.remove(8);
      keep(buffer.compact());
    }
  });

  bench(`some (early exit, x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(filledBuffer.some((val) => val === 5));
    }
  });

  bench(`some (full scan, x${REPEATS})`, () => {
    for (let i = 0; i < REPEATS; i++) {
      keep(filledBuffer.some((val) => val === 99));
    }
  });
});
