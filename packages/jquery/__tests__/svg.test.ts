import { describe, it, expect } from 'vitest';
import $ from 'jquery';
import '../src/index';

describe('SVG Support', () => {
    it('should handle SVG attributes correctly', async () => {
        // SVG namespaces
        const SVG_NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(SVG_NS, "svg");
        const $svg = $(svg).appendTo(document.body);
        
        const viewBox = $.atom('0 0 100 100');
        $svg.atomAttr('viewBox', viewBox);
        
        await $.nextTick();
        
        expect($svg.attr('viewBox')).toBe('0 0 100 100');
        // also check nativegetAttribute because jQuery .attr might sometimes be smart
        expect(svg.getAttribute('viewBox')).toBe('0 0 100 100');
        
        viewBox.value = '0 0 200 200';
        await $.nextTick();
        expect($svg.attr('viewBox')).toBe('0 0 200 200');
        
        $svg.remove();
    });

    it('should handle namespaced attributes (xlink:href)', async () => {
        const SVG_NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(SVG_NS, "svg");
        const use = document.createElementNS(SVG_NS, "use");
        svg.appendChild(use);
        const $use = $(use);
        $(svg).appendTo(document.body);
        
        const href = $.atom('#icon-1');
        
        // jQuery .attr usually handles direct names better, but strictly speaking 
        // xlink:href needs setAttributeNS. Let's see if plain atomAttr works 
        // via jQuery's abstracting or if we need specific handling.
        $use.atomAttr('xlink:href', href);
        
        await $.nextTick();
        
        expect($use.attr('xlink:href')).toBe('#icon-1');
        // Check standard DOM
        // Note: Modern browsers support 'href' directly, but checking if legacy xlink works
        expect(use.getAttribute('xlink:href')).toBe('#icon-1');

        href.value = '#icon-2';
        await $.nextTick();
        expect($use.attr('xlink:href')).toBe('#icon-2');
        
        $(svg).remove();
    });
    
    it('should toggle classes on SVG elements', async () => {
        const SVG_NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(SVG_NS, "svg");
        const circle = document.createElementNS(SVG_NS, "circle");
        svg.appendChild(circle);
        const $circle = $(circle);
        $(svg).appendTo(document.body);
        
        const isActive = $.atom(false);
        $circle.atomClass('active', isActive);
        
        await $.nextTick();
        expect($circle.hasClass('active')).toBe(false);
        
        isActive.value = true;
        await $.nextTick();
        
        // jQuery has historically struggled with SVG classes.
        // Let's verify our wrapper works.
        expect($circle.hasClass('active')).toBe(true);
        expect(circle.getAttribute('class')).toContain('active');
        
        $(svg).remove();
    });

    it('should render SVG lists correctly', async () => {
        const SVG_NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(SVG_NS, "svg");
        const g = document.createElementNS(SVG_NS, "g");
        svg.appendChild(g);
        const $g = $(g);
        $(svg).appendTo(document.body);
        
        const items = $.atom([1, 2, 3]);
        
        $g.atomList(items, {
            key: i => i,
            render: (i) => {
                const el = document.createElementNS(SVG_NS, "circle");
                el.setAttribute("cx", String(i*10));
                el.setAttribute("cy", "10");
                el.setAttribute("r", "5");
                return el;
            }
        });
        
        await $.nextTick();
        
        // Check if created elements are actually SVG elements
        const children = $g.children();
        expect(children.length).toBe(3);
        
        // Check namespace of first child
        // If it was created as HTMLUnknownElement (default for HTML parsing), this test will fail.
        // SVG elements must be in the SVG namespace.
        expect(children[0].namespaceURI).toBe(SVG_NS);
        expect(children[0].tagName).toMatch(/circle/i);
        
        $(svg).remove();
    });
});
