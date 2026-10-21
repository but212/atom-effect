import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSubmissionOutcome,
  escapeHtml,
  getSubmissionPresentation,
  runSubmission,
  SUBMISSION_DELAY_MS,
} from '../../examples/all/submission.js';

describe('submission example helpers', () => {
  afterEach(() => vi.useRealTimers());

  it('waits 1.5 seconds, then builds the success result from injected randomness and time', async () => {
    vi.useFakeTimers();
    const submittedAt = new Date('2026-10-04T12:34:56.000Z');
    const resultPromise = runSubmission({
      random: () => 0.7,
      now: () => submittedAt,
      wait: (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
    });

    await vi.advanceTimersByTimeAsync(SUBMISSION_DELAY_MS - 1);
    await expect(Promise.race([resultPromise, Promise.resolve('pending')])).resolves.toBe(
      'pending'
    );
    await vi.advanceTimersByTimeAsync(1);

    await expect(resultPromise).resolves.toEqual({
      status: 'resolved',
      value: { success: true, timestamp: '2026-10-04T12:34:56.000Z' },
    });
  });

  it('keeps the 30 percent simulated error and derives UI state without mutation', () => {
    const rejected = createSubmissionOutcome(0.71, '2026-10-04T12:34:56.000Z');
    expect(rejected).toEqual({
      status: 'rejected',
      message: 'DATABASE_TIMEOUT: Failed to persist changes.',
    });
    expect(getSubmissionPresentation(rejected)).toMatchObject({
      visible: true,
      disabled: false,
      buttonText: 'Retry Save',
      errorMessage: 'DATABASE_TIMEOUT: Failed to persist changes.',
    });
    expect(rejected).toEqual({
      status: 'rejected',
      message: 'DATABASE_TIMEOUT: Failed to persist changes.',
    });
    expect(escapeHtml(`<img src=x onerror="alert('x')">`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;'
    );
  });
});
