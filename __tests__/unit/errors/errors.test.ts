/**
 * @fileoverview 에러 클래스 테스트 (커버리지 보완)
 */

import { describe, expect, it } from 'vitest';
import {
  AtomError,
  ComputedError,
  EffectError,
  isPromise,
  SchedulerError,
  wrapError,
} from '@/errors/errors';

describe('에러 클래스', () => {
  it('AtomError가 올바른 속성을 가진다', () => {
    const error = new AtomError('Test message');

    expect(error.name).toBe('AtomError');
    expect(error.message).toBe('Test message');
    expect(error.cause).toBe(null);
    expect(error.recoverable).toBe(true);
    expect(error.timestamp).toBeInstanceOf(Date);
  });

  it('AtomError에 cause를 전달할 수 있다', () => {
    const cause = new Error('Original error');
    const error = new AtomError('Wrapped error', cause);

    expect(error.cause).toBe(cause);
  });

  it('AtomError의 recoverable을 설정할 수 있다', () => {
    const error = new AtomError('Test', null, false);

    expect(error.recoverable).toBe(false);
  });

  it('ComputedError가 AtomError를 상속한다', () => {
    const error = new ComputedError('Computed failed');

    expect(error).toBeInstanceOf(AtomError);
    expect(error.name).toBe('ComputedError');
    expect(error.recoverable).toBe(true);
  });

  it('ComputedError에 cause를 전달할 수 있다', () => {
    const cause = new Error('Root cause');
    const error = new ComputedError('Computed error', cause);

    expect(error.cause).toBe(cause);
  });

  it('EffectError가 AtomError를 상속한다', () => {
    const error = new EffectError('Effect failed');

    expect(error).toBeInstanceOf(AtomError);
    expect(error.name).toBe('EffectError');
    expect(error.recoverable).toBe(false); // effect는 recoverable=false
  });

  it('EffectError에 cause를 전달할 수 있다', () => {
    const cause = new Error('Root cause');
    const error = new EffectError('Effect error', cause);

    expect(error.cause).toBe(cause);
  });

  it('SchedulerError가 AtomError를 상속한다', () => {
    const error = new SchedulerError('Scheduler failed');

    expect(error).toBeInstanceOf(AtomError);
    expect(error.name).toBe('SchedulerError');
    expect(error.recoverable).toBe(false);
  });

  it('SchedulerError에 cause를 전달할 수 있다', () => {
    const cause = new Error('Root cause');
    const error = new SchedulerError('Scheduler error', cause);

    expect(error.cause).toBe(cause);
  });
});

describe('wrapError 유틸리티', () => {
  it('TypeError를 올바르게 래핑한다', () => {
    const typeError = new TypeError('Type is wrong');
    const wrapped = wrapError(typeError, ComputedError, '계산');

    expect(wrapped).toBeInstanceOf(ComputedError);
    expect(wrapped.message).toContain('Type error');
    expect(wrapped.message).toContain('계산');
    expect(wrapped.cause).toBe(typeError);
  });

  it('ReferenceError를 올바르게 래핑한다', () => {
    const refError = new ReferenceError('Variable not found');
    const wrapped = wrapError(refError, EffectError, '실행');

    expect(wrapped).toBeInstanceOf(EffectError);
    expect(wrapped.message).toContain('Reference error');
    expect(wrapped.message).toContain('실행');
    expect(wrapped.cause).toBe(refError);
  });

  it('AtomError는 그대로 반환한다', () => {
    const atomError = new AtomError('Already wrapped');
    const wrapped = wrapError(atomError, ComputedError, '테스트');

    expect(wrapped).toBe(atomError); // 동일한 객체
  });

  it('일반 에러를 예기치 않은 오류로 래핑한다', () => {
    const genericError = new Error('Generic error');
    const wrapped = wrapError(genericError, SchedulerError, '스케줄링');

    expect(wrapped).toBeInstanceOf(SchedulerError);
    expect(wrapped.message).toContain('Unexpected error');
    expect(wrapped.message).toContain('스케줄링');
    expect(wrapped.cause).toBe(genericError);
  });
});

describe('isPromise 타입 가드', () => {
  it('Promise를 올바르게 감지한다', () => {
    const promise = Promise.resolve(42);
    expect(isPromise(promise)).toBe(true);
  });

  it('then 메서드가 있는 객체를 Promise로 인식한다', () => {
    const thenable = { then: () => {} };
    expect(isPromise(thenable)).toBe(true);
  });

  it('일반 객체는 Promise가 아니다', () => {
    expect(isPromise({})).toBe(false);
    expect(isPromise(null)).toBe(false);
    expect(isPromise(undefined)).toBe(false);
    expect(isPromise(42)).toBe(false);
    expect(isPromise('string')).toBe(false);
  });

  it('then이 함수가 아니면 Promise가 아니다', () => {
    const notPromise = { then: 'not a function' };
    expect(isPromise(notPromise)).toBe(false);
  });
});
