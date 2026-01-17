import { describe, it, expect } from 'vitest';
import $ from 'jquery';
import '../src/index';

describe('Keyed Diffing (Reconciliation)', () => {
    // Custom property to verify element preservation
    const EXPANDO = 'data-test-expando';

    it('should reuse existing DOM elements when moving items', async () => {
        const items = $.atom([
            { id: 1, text: 'A' },
            { id: 2, text: 'B' },
            { id: 3, text: 'C' }
        ]);
        const $ul = $('<ul>').appendTo(document.body);

        $ul.atomList(items, {
            key: 'id',
            render: (item) => `<li id="item-${item.id}">${item.text}</li>`
        });

        await $.nextTick();

        // Mark elements
        const $elA = $ul.find('#item-1');
        const $elB = $ul.find('#item-2');
        const $elC = $ul.find('#item-3');

        $elA.attr(EXPANDO, 'A-preserved');
        $elB.attr(EXPANDO, 'B-preserved');
        $elC.attr(EXPANDO, 'C-preserved');

        // Move items: A, B, C -> C, A, B (Rotation)
        items.value = [
            { id: 3, text: 'C' },
            { id: 1, text: 'A' },
            { id: 2, text: 'B' }
        ];

        await $.nextTick();

        // Check order
        const $children = $ul.children();
        expect($children.eq(0).attr('id')).toBe('item-3');
        expect($children.eq(1).attr('id')).toBe('item-1');
        expect($children.eq(2).attr('id')).toBe('item-2');

        // Check preservation (Identity check)
        // If they were re-created, the attribute would be gone (or the element reference strictly different)
        // Note: $elA.attr checks the specific object we have, but we need to check the DOM's current children.
        
        expect($children.eq(0).attr(EXPANDO)).toBe('C-preserved');
        expect($children.eq(1).attr(EXPANDO)).toBe('A-preserved');
        expect($children.eq(2).attr(EXPANDO)).toBe('B-preserved');
        
        // Ensure strictly same elements
        expect($children[0] === $elC[0]).toBe(true);
        expect($children[1] === $elA[0]).toBe(true);
        expect($children[2] === $elB[0]).toBe(true);
        
        $ul.remove();
    });

    it('should handle middle insertion without recreating neighbors', async () => {
        const items = $.atom([1, 3]);
        const $ul = $('<ul>').appendTo(document.body);

        $ul.atomList(items, {
            key: (i) => i,
            render: (i) => `<li>${i}</li>`
        });

        await $.nextTick();
        
        const el1 = $ul.children()[0];
        const el3 = $ul.children()[1];

        // Insert 2 in middle
        items.value = [1, 2, 3];
        await $.nextTick();

        const $children = $ul.children();
        expect($children.length).toBe(3);
        expect($children.eq(1).text()).toBe('2');

        // 1 and 3 should be preserved
        expect($children[0] === el1).toBe(true);
        expect($children[2] === el3).toBe(true);

        $ul.remove();
    });
    
    it('should handle reverse order efficiently', async () => {
        const items = $.atom([1, 2, 3, 4, 5]);
        const $ul = $('<ul>').appendTo(document.body);

        $ul.atomList(items, {
            key: (i) => i,
            render: (i) => `<li>${i}</li>`
        });

        await $.nextTick();
        
        const originalChildrenMap = new Map($ul.children().toArray().map(el => [Number($(el).text()), el]));

        // Reverse
        items.value = [5, 4, 3, 2, 1];
        await $.nextTick();

        const newChildren = $ul.children().toArray();
        expect(newChildren.length).toBe(5);
        
        // Everything should be reused
        items.value.forEach((val, idx) => {
            expect(Number($(newChildren[idx]).text())).toBe(val);
             // Find original element for this val
             const orig = originalChildrenMap.get(val);
             expect(newChildren[idx] === orig).toBe(true);
        });

        $ul.remove();
    });

    it('should call update callback when reusing items', async () => {
        const items = $.atom([
            { id: 1, text: 'A' }
        ]);
        const $ul = $('<ul>').appendTo(document.body);
        
        $ul.atomList(items, {
            key: 'id',
            render: (item) => `<li id="item-${item.id}">${item.text}</li>`,
            update: ($el, item) => $el.text(item.text)
        });
        
        await $.nextTick();
        
        const $li = $ul.find('#item-1');
        expect($li.text()).toBe('A');
        const domElement = $li[0];
        
        // Update content but keep ID (reuse reference)
        items.value = [{ id: 1, text: 'A-Updated' }];
        await $.nextTick();
        
        const $liUpdated = $ul.find('#item-1');
        expect($liUpdated[0]).toBe(domElement); // Element reused
        expect($liUpdated.text()).toBe('A-Updated'); // Content updated via hook
        
        $ul.remove();
    });

    it('should handle empty state transitions correctly', async () => {
        const items = $.atom([{ id: 1 }]);
        const $ul = $('<ul>').appendTo(document.body);
        
        $ul.atomList(items, {
            key: 'id',
            render: (item) => `<li>${item.id}</li>`,
            empty: '<li class="empty-placeholder">Empty</li>'
        });
        
        await $.nextTick();
        expect($ul.find('li').not('.empty-placeholder').length).toBe(1);
        expect($ul.find('.empty-placeholder').length).toBe(0);
        
        // To Empty
        items.value = [];
        await $.nextTick();
        expect($ul.find('li').not('.empty-placeholder').length).toBe(0);
        expect($ul.find('.empty-placeholder').length).toBe(1);
        
        // Back to Filled
        items.value = [{ id: 2 }];
        await $.nextTick();
        expect($ul.find('li').not('.empty-placeholder').length).toBe(1);
        expect($ul.find('.empty-placeholder').length).toBe(0);
        
        $ul.remove();
    });
});
