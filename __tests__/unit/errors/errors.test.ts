/**
 * @fileoverview Error class tests (coverage supplement)
 */

import {
  AtomError,
  ComputedError,
  EffectError,
  isPromise,
  SchedulerError,
  wrapError,
} from '@/errors/errors';
import { describe, expect, it } from 'vitest';

describe('Error Classes', () => {
  it('AtomError has correct properties', () => {
    const error = new AtomError('Test message');

    expect(error.name).toBe('AtomError');
    expect(error.message).toBe('Test message');
    expect(error.cause).toBe(null);
    expect(error.recoverable).toBe(true);
    expect(error.timestamp).toBeInstanceOf(Date);
  });

  it('AtomError can receive cause', () => {
    const cause = new Error('Original error');
    const error = new AtomError('Wrapped error', cause);

    expect(error.cause).toBe(cause);
  });

  it('AtomError recoverable can be set', () => {
    const error = new AtomError('Test', null, false);

    expect(error.recoverable).toBe(false);
  });

  it('ComputedError extends AtomError', () => {
    const error = new ComputedError('Computed failed');

    expect(error).toBeInstanceOf(AtomError);
    expect(error.name).toBe('ComputedError');
    expect(error.recoverable).toBe(true);
  });

  it('ComputedError can receive cause', () => {
    const cause = new Error('Root cause');
    const error = new ComputedError('Computed error', cause);

    expect(error.cause).toBe(cause);
  });

  it('EffectError extends AtomError', () => {
    const error = new EffectError('Effect failed');

    expect(error).toBeInstanceOf(AtomError);
    expect(error.name).toBe('EffectError');
    expect(error.recoverable).toBe(false); // effect has recoverable=false
  });

  it('EffectError can receive cause', () => {
    const cause = new Error('Root cause');
    const error = new EffectError('Effect error', cause);

    expect(error.cause).toBe(cause);
  });

  it('SchedulerError extends AtomError', () => {
    const error = new SchedulerError('Scheduler failed');

    expect(error).toBeInstanceOf(AtomError);
    expect(error.name).toBe('SchedulerError');
    expect(error.recoverable).toBe(false);
  });

  it('SchedulerError can receive cause', () => {
    const cause = new Error('Root cause');
    const error = new SchedulerError('Scheduler error', cause);

    expect(error.cause).toBe(cause);
  });
});

describe('wrapError Utility', () => {
  it('wraps TypeError correctly', () => {
    const typeError = new TypeError('Type is wrong');
    const wrapped = wrapError(typeError, ComputedError, 'computation');

    expect(wrapped).toBeInstanceOf(ComputedError);
    expect(wrapped.message).toContain('Type error');
    expect(wrapped.message).toContain('computation');
    expect(wrapped.cause).toBe(typeError);
  });

  it('wraps ReferenceError correctly', () => {
    const refError = new ReferenceError('Variable not found');
    const wrapped = wrapError(refError, EffectError, 'execution');

    expect(wrapped).toBeInstanceOf(EffectError);
    expect(wrapped.message).toContain('Reference error');
    expect(wrapped.message).toContain('execution');
    expect(wrapped.cause).toBe(refError);
  });

  it('returns AtomError as is', () => {
    const atomError = new AtomError('Already wrapped');
    const wrapped = wrapError(atomError, ComputedError, 'test');

    expect(wrapped).toBe(atomError); // same object
  });

  it('wraps generic error as unexpected error', () => {
    const genericError = new Error('Generic error');
    const wrapped = wrapError(genericError, SchedulerError, 'scheduling');

    expect(wrapped).toBeInstanceOf(SchedulerError);
    expect(wrapped.message).toContain('Unexpected error');
    expect(wrapped.message).toContain('scheduling');
    expect(wrapped.cause).toBe(genericError);
  });
});

describe('isPromise Type Guard', () => {
  it('detects Promise correctly', () => {
    const promise = Promise.resolve(42);
    expect(isPromise(promise)).toBe(true);
  });

  it('recognizes object with then method as Promise', () => {
    const thenable = { then: () => {} };
    expect(isPromise(thenable)).toBe(true);
  });

  it('plain objects are not Promise', () => {
    expect(isPromise({})).toBe(false);
    expect(isPromise(null)).toBe(false);
    expect(isPromise(undefined)).toBe(false);
    expect(isPromise(42)).toBe(false);
    expect(isPromise('string')).toBe(false);
  });

  it('not a Promise if then is not a function', () => {
    const notPromise = { then: 'not a function' };
    expect(isPromise(notPromise)).toBe(false);
  });
});
