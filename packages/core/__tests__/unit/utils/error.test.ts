import { describe, expect, it } from 'vitest';
import { AtomError, wrapError } from '@/errors';

describe('Error Utilities', () => {
  it('Error handling wrapError fallback (error.ts 22)', () => {
    const err = wrapError('string error', AtomError, 'message');
    expect(err).toBeInstanceOf(AtomError);
  });
});
