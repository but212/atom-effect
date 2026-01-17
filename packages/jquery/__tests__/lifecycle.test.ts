import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import $ from 'jquery';
import '../src/index'; // Register plugins
import { registry, enableAutoCleanup, disableAutoCleanup } from '../src/registry';
import { enablejQueryOverrides } from '../src/jquery-patch';
import { atom } from '@but212/atom-effect';

// Polyfill MutationObserver if needed (jsdom usually supports it)
// But we want to ensure we wait for it.
const nextTick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('jQuery Lifecycle Overrides', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        enablejQueryOverrides();
        enableAutoCleanup(document.body);
    });

    afterEach(() => {
        disableAutoCleanup();
        registry.cleanupTree(document.body);
    });

    it('should clean up bindings on .remove()', () => {
        const $el = $('<div></div>').appendTo(document.body);
        const text = atom('hello');
        $el.atomText(text);

        expect(registry.hasBind($el[0])).toBe(true);

        $el.remove();

        expect(registry.hasBind($el[0])).toBe(false);
    });

    it('should clean up children bindings on .empty()', () => {
        const $parent = $('<div></div>').appendTo(document.body);
        const $child = $('<span></span>').appendTo($parent);
        const text = atom('hello');
        $child.atomText(text);

        expect(registry.hasBind($child[0])).toBe(true);

        $parent.empty();

        expect(registry.hasBind($child[0])).toBe(false);
        expect($parent[0].hasChildNodes()).toBe(false);
    });

    it('should NOT clean up bindings on .detach()', async () => {
        const $el = $('<div></div>').appendTo(document.body);
        const text = atom('hello');
        $el.atomText(text);

        expect(registry.hasBind($el[0])).toBe(true);

        const $detached = $el.detach();

        // Wait for MutationObserver to potentially fire
        await nextTick();

        expect(registry.hasBind($el[0])).toBe(true); // Should still be bound
        expect(document.body.contains($el[0])).toBe(false);

        // Verify reactivity works in memory
        text.value = 'world';
        await nextTick();
        expect($el.text()).toBe('world');

        // Re-attach
        $detached.appendTo(document.body);
        
        await nextTick(); // Observer sees add
        
        text.value = 'again';
        await nextTick();
        expect($el.text()).toBe('again');
    });

    it('should eventually clean up detached element if manually removed later', () => {
        const $el = $('<div></div>').appendTo(document.body);
        const text = atom('val');
        $el.atomText(text);
        
        const $detached = $el.detach();
        expect(registry.hasBind($el[0])).toBe(true);
        
        // Now remove the detached element (it's not in DOM, but .remove() on it triggers cleanup)
        $detached.remove();
        
        expect(registry.hasBind($el[0])).toBe(false);
    });

    it('should not leak memory when .remove() is called multiple times', () => {
        const $el = $('<div></div>').appendTo(document.body);
        const text = atom('test');
        $el.atomText(text);
        
        $el.remove();
        expect(registry.hasBind($el[0])).toBe(false);
        
        // call remove again
        $el.remove(); 
        // Should not throw
    });
});
