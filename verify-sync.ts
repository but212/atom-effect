
import { atom, effect } from './src/index';
import { createRenderEffect, createRoot, createSignal } from 'solid-js';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window as any;
global.document = dom.window.document;

async function verifySynchronousUpdates() {
    console.log('--- Verification Start ---');

    // 1. Reactive Sync
    {
        console.log('\n[Reactive Sync Check]');
        const val = atom(0, { sync: true });
        const el = document.createElement('div');
        const e = effect(() => {
            console.log(`[Reactive] Effect Running. Value: ${val.value}`);
            el.textContent = `Val: ${val.value}`;
        }, { sync: true, maxExecutionsPerSecond: 0 });

        console.log(`Initial: "${el.textContent}"`); 

        val.value = 1;
        console.log(`After 1: "${el.textContent}"`); 

        val.value = 2;
        console.log(`After 2: "${el.textContent}"`);
        
        for(let i=3; i<=10; i++) {
            val.value = i;
        }
        console.log(`After 10: "${el.textContent}"`);
        
        e.dispose();
    }

    // 2. SolidJS Sync Check
    {
        console.log('\n[SolidJS Sync Check]');
        const { createSignal, createRoot, createComputed } = await import('solid-js');
        const el = document.createElement('div');
        
        createRoot((dispose) => {
            const [val, setVal] = createSignal(0);
            createComputed(() => {
                console.log(`[Solid] Effect Running. Value: ${val()}`);
                el.textContent = `Val: ${val()}`;
            });

            console.log(`Initial: "${el.textContent}"`);

            setVal(1);
            console.log(`After 1: "${el.textContent}"`);

            setVal(2);
            console.log(`After 2: "${el.textContent}"`);
            
            dispose();
        });
    }
}

// Wrap in async IIFE
(async () => {
    await verifySynchronousUpdates();
})();
