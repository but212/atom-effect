import { describe, it, expect } from 'vitest';
import $ from 'jquery';
import '../src/index'; 

function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('Memory Leak Prevention', () => {
  it('should cleanup bindings when element is removed', async () => {
    const count = $.atom(0);
    
    let formatRuns = 0;
    const $el = $('<div id="test"></div>').appendTo(document.body);
    $el.atomText(count, (v) => {
        formatRuns++;
        return String(v);
    });

    await tick();
    expect(formatRuns).toBe(1); // Initial run
    
    // DOM 제거
    $el.remove();
    
    // MutationObserver needs time to fire
    await new Promise(resolve => setTimeout(resolve, 50)); 

    // 값 변경해도 effect가 실행되지 않아야 함
    count.value = 999;
    await tick();

    // MutationObserver가 cleanup 해줬으므로 증가 없음
    expect(formatRuns).toBe(1);
  });

  it('should cleanup children on .empty()', async () => {
    const $container = $('<div id="container"></div>').appendTo(document.body);
    const $child = $('<span id="child"></span>').appendTo($container);

    const text = $.atom('hello');
    let formatRuns = 0;
    
    $child.atomText(text, (v) => {
        formatRuns++;
        return String(v);
    });

    await tick();
    expect($child.text()).toBe('hello');
    expect(formatRuns).toBe(1);

    // empty()로 자식 제거
    $container.empty();
    
    // MutationObserver needs time to fire
    await new Promise(resolve => setTimeout(resolve, 50));

    text.value = 'world';
    await tick();

    // 더 이상 업데이트 안 됨 (정리됨)
    expect(formatRuns).toBe(1);
    
    $container.remove();
  });
});
