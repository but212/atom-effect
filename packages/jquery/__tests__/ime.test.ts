import { describe, it, expect } from 'vitest';
import $ from 'jquery';
import '../src/index'; 

function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('IME Support (Korean Input)', () => {
  it('should not update during composition', async () => {
    const text = $.atom('');
    let updateCount = 0;
    text.subscribe(() => updateCount++);

    const $input = $('<input type="text">').appendTo(document.body);
    $input.atomVal(text);

    await tick();
    const initial = updateCount;

    // 한글 입력 시뮬레이션
    $input.trigger('compositionstart');
    
    // composition update logic is handled by browser usually, but we simulate events
    $input.val('ㅎ').trigger('input');
    $input.val('하').trigger('input');
    $input.val('한').trigger('input');

    // 조합 중에는 업데이트 안 됨 (isComposing check in chainable.ts)
    expect(updateCount).toBe(initial);
    expect(text.value).toBe(''); 

    // 조합 완료
    $input.trigger('compositionend');
    
    // Wait for batch updates
    await tick();

    // 이제서야 업데이트
    expect(updateCount).toBe(initial + 1);
    expect(text.value).toBe('한');
    
    $input.remove();
  });
});
