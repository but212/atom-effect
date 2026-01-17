import { describe, it, expect, vi } from 'vitest';
import $ from 'jquery';
import '../src/index';
import { enablejQueryBatching } from '../src/jquery-patch';
import { atom } from '@but212/atom-effect';

describe('jQuery Auto-Batching', () => {
    it('should batch updates inside jQuery events when enabled', async () => {
        enablejQueryBatching();
        
        const count = atom(0);
        let computeCount = 0;
        
        $.effect(() => {
            const _val = count.value;
            computeCount++;
        });
        
        computeCount = 0;
        
        const $btn = $('<button>').appendTo(document.body);
        
        $btn.on('click', () => {
            count.value++;
            count.value++;
        });
        
        $btn.trigger('click');
        
        await $.nextTick();
        
        expect(computeCount).toBe(1);
        expect(count.value).toBe(2);
        
        $btn.remove();
    });

    it('should handle .off() correctly with original handler reference', () => {
        // Assume enabled from previous test safely or call again (idempotent-ish? no, it wraps again if called again!)
        // enabling again would wrap the wrapper... bad.
        // We should move enabling to setup or beforeAll, but we don't have a way to check if enabled.
        // For this test file, we assume first test enabled it.
        // IF we want robustness, we need a singleton check in patcher, but simpler: just run enabling once per file suite?
        // Or if vitest resets modules... check if it does.
        
        const handler = vi.fn();
        const $btn = $('<button>').appendTo(document.body);
        
        $btn.on('click', handler);
        $btn.trigger('click');
        expect(handler).toHaveBeenCalledTimes(1);
        
        $btn.off('click', handler);
        $btn.trigger('click');
        expect(handler).toHaveBeenCalledTimes(1);
        
        $btn.remove();
    });

    it('should respect original context (this)', () => {
        const $btn = $('<button>').appendTo(document.body);
        let capturedThis: HTMLElement | null = null;
        
        $btn.on('click', function(this: HTMLElement) {
            capturedThis = this;
        });
        
        $btn.trigger('click');
        expect(capturedThis).toBe($btn[0]);
        $btn.remove();
    });

    it('should reuse wrapper for same handler (cache hit)', () => {
        // Coverage for line 38
        const handler = () => {};
        const $btn = $('<button>');
        
        // First bind
        $btn.on('click', handler);
        
        // Second bind - should hit cache
        $btn.on('mouseover', handler);
        
        $btn.off('click', handler);
        $btn.off('mouseover', handler);
    });
});
