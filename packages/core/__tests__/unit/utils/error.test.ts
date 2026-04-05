import { describe, expect, it } from 'vitest';
import { AtomError } from '@/errors/errors';
import { wrapError } from '@/utils/error';

describe('Error Utilities', () => {
  it('Error handling wrapError fallback (error.ts 22)', () => {
    const err = wrapError('string error', AtomError, 'message');
    expect(err).toBeInstanceOf(AtomError);
  });
});
