/**
 * @fileoverview DOM Update benchmark - 공정한 비교 버전
 * 
 * 문제점 분석:
 * - 기존 벤치마크에서 Vanilla JS는 매번 실제 DOM을 업데이트했지만,
 * - Reactive/SolidJS는 배치 처리로 실제 DOM 업데이트를 건너뛰거나 지연시켰을 가능성
 * - 이로 인해 45배 차이라는 비현실적인 결과가 나옴
 * 
 * 해결책:
 * 1. 모든 라이브러리가 실제로 DOM을 업데이트하도록 강제
 * 2. 업데이트 후 DOM 값을 읽어서 실제 반영 확인
 * 3. 동기/비동기 실행 조건 통일
 */

import { JSDOM } from 'jsdom';
import { Bench } from 'tinybench';
import { atom, effect, batch } from '../../src';
import { createSignal, createEffect, createRoot, createRenderEffect } from 'solid-js';

// JSDOM 환경 설정
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const document = dom.window.document;

interface BenchmarkResult {
  name: string;
  opsPerSec: number;
  meanTime: number;
  margin: number;
  samples: number;
}

/**
 * 공정한 DOM 업데이트 벤치마크
 * 
 * 핵심 변경:
 * 1. 각 반복마다 DOM 값을 읽어서 실제 업데이트 확인
 * 2. sync 모드로 reactive 라이브러리 실행 (배치 우회)
 * 3. 동일한 DOM 조작 횟수 보장
 */
export async function runDOMUpdateBenchmark(): Promise<{ results: BenchmarkResult[] }> {
  console.log('\nDOM Updates (Fair Comparison)');
  console.log('='.repeat(80));

  const bench = new Bench({
    time: 1000,
    iterations: 5,
  });

  // 테스트용 DOM 요소 생성
  const container = document.createElement('div');
  document.body.appendChild(container);

  // ========================================
  // 1. Vanilla JS - 직접 DOM 조작
  // ========================================
  bench.add('Vanilla JS: Update text (with read)', () => {
    const el = document.createElement('span');
    container.appendChild(el);
    
    for (let i = 0; i < 100; i++) {
      el.textContent = `Count: ${i}`;
      // 실제 DOM 업데이트 확인 (읽기 강제)
      const _ = el.textContent;
    }
    
    container.removeChild(el);
  });

  // ========================================
  // 2. Reactive Atom - sync 모드 (배치 우회)
  // ========================================
  bench.add('Reactive: Update text (sync, with read)', () => {
    const el = document.createElement('span');
    container.appendChild(el);
    
    // sync: true로 즉시 실행 강제
    const count = atom(0, { sync: true });
    
    // effect도 sync 모드로
    const e = effect(() => {
      el.textContent = `Count: ${count.value}`;
    }, { sync: true, maxExecutionsPerSecond: 0 }); // 0 = Loop detection disabled
    
    for (let i = 0; i < 100; i++) {
      count.value = i;
      // 실제 DOM 업데이트 확인
      const _ = el.textContent;
    }
    
    e.dispose();
    container.removeChild(el);
  });

  // ========================================
  // 2.5 SolidJS - Sync Mode
  // ========================================
  bench.add('SolidJS: Update text (sync)', () => {
    const el = document.createElement('span');
    container.appendChild(el);
    
    createRoot((dispose) => {
        const [count, setCount] = createSignal(0);
        createRenderEffect(() => {
             el.textContent = `Count: ${count()}`;
        });

        for (let i = 0; i < 100; i++) {
            setCount(i);
            const _ = el.textContent;
        }
        dispose();
    });
    container.removeChild(el);
  });

  // ========================================
  // 3. Reactive Atom - 기본 모드 (비동기)
  // ========================================
  bench.add('Reactive: Update text (async, batched)', async () => {
    const el = document.createElement('span');
    container.appendChild(el);
    
    const count = atom(0);
    
    const e = effect(() => {
      el.textContent = `Count: ${count.value}`;
    });
    
    // 마이크로태스크 대기
    await Promise.resolve();
    
    for (let i = 0; i < 100; i++) {
      count.value = i;
    }
    
    // 배치 처리 완료 대기
    await Promise.resolve();
    await new Promise(r => setTimeout(r, 0));
    
    // 최종 값만 확인 (배치로 인해 중간값은 스킵됨)
    const _ = el.textContent;
    
    e.dispose();
    container.removeChild(el);
  });

  // ========================================
  // 4. Vanilla JS - 배치 시뮬레이션 (공정 비교용)
  // ========================================
  bench.add('Vanilla JS: Update text (batched simulation)', () => {
    const el = document.createElement('span');
    container.appendChild(el);
    
    // Reactive의 배치와 유사하게 마지막 값만 적용
    let lastValue = 0;
    for (let i = 0; i < 100; i++) {
      lastValue = i;
    }
    
    // 실제 DOM 업데이트는 한 번만
    el.textContent = `Count: ${lastValue}`;
    const _ = el.textContent;
    
    container.removeChild(el);
  });

  // ========================================
  // 5. 순수 상태 업데이트 비용 (DOM 제외)
  // ========================================
  bench.add('Reactive: State update only (no DOM)', () => {
    const count = atom(0, { sync: true });
    let sum = 0;
    
    // DOM 없이 순수 상태 업데이트만
    for (let i = 0; i < 100; i++) {
      count.value = i;
      sum += count.value;
    }
  });

  bench.add('Vanilla JS: Variable update only (no DOM)', () => {
    let count = 0;
    let sum = 0;
    
    for (let i = 0; i < 100; i++) {
      count = i;
      sum += count;
    }
  });

  await bench.run();

  // 결과 출력
  const results: BenchmarkResult[] = bench.tasks.map(task => ({
    name: task.name,
    opsPerSec: task.result?.hz || 0,
    meanTime: task.result?.mean || 0,
    margin: task.result?.rme || 0,
    samples: task.result?.samples?.length || 0,
  }));

  console.table(
    results.map(r => ({
      Benchmark: r.name,
      'Ops/sec': r.opsPerSec.toLocaleString('en-US', { maximumFractionDigits: 0 }),
      'Mean (ms)': (r.meanTime * 1000).toFixed(4),
      'Margin (±%)': r.margin.toFixed(2),
      Samples: r.samples,
    }))
  );

  // 분석 출력
  console.log('\n📊 Analysis:');
  console.log('─'.repeat(60));
  
  const vanillaWithRead = results.find(r => r.name.includes('Vanilla JS: Update text (with read)'));
  const reactiveSync = results.find(r => r.name.includes('Reactive: Update text (sync'));
  const vanillaBatched = results.find(r => r.name.includes('batched simulation'));
  const reactiveAsync = results.find(r => r.name.includes('async, batched'));
  
  if (vanillaWithRead && reactiveSync) {
    const ratio = vanillaWithRead.opsPerSec / reactiveSync.opsPerSec;
    console.log(`\n🔄 Fair Comparison (both sync, both read DOM):`);
    console.log(`   Vanilla JS / Reactive ratio: ${ratio.toFixed(2)}x`);
    
    if (ratio > 1) {
      console.log(`   → Vanilla JS is ${((ratio - 1) * 100).toFixed(1)}% faster (expected due to no reactive overhead)`);
    } else {
      console.log(`   → Reactive is ${((1/ratio - 1) * 100).toFixed(1)}% faster`);
    }
  }
  
  if (vanillaBatched && reactiveAsync) {
    const ratio = vanillaBatched.opsPerSec / reactiveAsync.opsPerSec;
    console.log(`\n📦 Batched Comparison:`);
    console.log(`   Vanilla (batched sim) / Reactive (async) ratio: ${ratio.toFixed(2)}x`);
  }

  // 정리
  container.remove();

  return { results };
}

// 직접 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  runDOMUpdateBenchmark().catch(console.error);
}