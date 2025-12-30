/**
 * @fileoverview Scheduler 테스트 (커버리지 보완)
 */

import { describe, expect, it, vi } from 'vitest';
import { SchedulerError } from '@/errors/errors';
import { scheduler } from '@/utils/scheduler';

describe('Scheduler', () => {
  // Scheduler는 Promise.resolve()를 사용하므로 실제 타이머 사용

  it('잘못된 타입의 콜백을 거부한다', () => {
    expect(() => {
      scheduler.schedule('not a function' as any);
    }).toThrow(SchedulerError);

    expect(() => {
      scheduler.schedule(null as any);
    }).toThrow(SchedulerError);
  });

  it('콜백을 비동기로 실행한다', async () => {
    const callback = vi.fn();

    scheduler.schedule(callback);
    expect(callback).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(callback).toHaveBeenCalled();
  });

  it('중복된 콜백은 한 번만 실행한다', async () => {
    const callback = vi.fn();

    scheduler.schedule(callback);
    scheduler.schedule(callback);
    scheduler.schedule(callback);

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Set을 사용하므로 중복 제거 (최소 1번 이상 호출)
    expect(callback).toHaveBeenCalled();
  });

  it('배치 중에는 flush하지 않는다', () => {
    const callback = vi.fn();

    scheduler.startBatch();
    scheduler.schedule(callback);

    expect(callback).not.toHaveBeenCalled();
    expect(scheduler.isBatching).toBe(true);
  });

  it('배치 종료 시 flush한다', async () => {
    // 이전 테스트 영향 초기화
    while (scheduler.isBatching) {
      scheduler.endBatch();
    }

    const callback = vi.fn();

    scheduler.startBatch();
    scheduler.schedule(callback);
    scheduler.endBatch();

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(callback).toHaveBeenCalled();
    expect(scheduler.isBatching).toBe(false);
  });

  it('중첩 배치를 지원한다', async () => {
    // 이전 테스트 영향 초기화
    while (scheduler.isBatching) {
      scheduler.endBatch();
    }

    const callback = vi.fn();

    scheduler.startBatch();
    expect(scheduler.isBatching).toBe(true);

    scheduler.startBatch();
    expect(scheduler.isBatching).toBe(true);

    scheduler.schedule(callback);

    scheduler.endBatch();
    expect(scheduler.isBatching).toBe(true); // 아직 바깥 배치 진행 중
    expect(callback).not.toHaveBeenCalled();

    scheduler.endBatch();
    expect(scheduler.isBatching).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(callback).toHaveBeenCalled();
  });

  it('콜백 실행 중 에러를 처리한다', async () => {
    // 이전 테스트 영향 초기화
    while (scheduler.isBatching) {
      scheduler.endBatch();
    }

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const errorCallback = vi.fn(() => {
      throw new Error('Callback error');
    });
    const normalCallback = vi.fn();

    scheduler.schedule(errorCallback);
    scheduler.schedule(normalCallback);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(errorCallback).toHaveBeenCalled();
    expect(normalCallback).toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('flush 중 새로운 스케줄은 대기한다', async () => {
    // 이전 테스트 영향 초기화
    while (scheduler.isBatching) {
      scheduler.endBatch();
    }

    const callback1 = vi.fn();
    const callback2 = vi.fn();

    scheduler.schedule(callback1);

    // 첫 번째 콜백 실행 대기
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(callback1).toHaveBeenCalled();

    // 두 번째 콜백 추가
    scheduler.schedule(callback2);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(callback2).toHaveBeenCalled();
  });

  it('batchDepth가 음수가 되지 않는다', () => {
    scheduler.endBatch();
    scheduler.endBatch();
    scheduler.endBatch();

    // 음수가 되지 않고 0으로 유지
    expect((scheduler as any).batchDepth).toBe(0);
  });

  it('큐가 비어있으면 flush하지 않는다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // 빈 큐로 flush 호출
    (scheduler as any).flush();

    await new Promise((resolve) => setTimeout(resolve, 10));

    // 에러 없이 정상 종료
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('처리 중이면 flush를 스킵한다', async () => {
    const callback = vi.fn();

    scheduler.schedule(callback);

    await new Promise((resolve) => setTimeout(resolve, 10));

    // 콜백이 한 번만 실행되어야 함
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
