
import { describe, expect, it } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { effect } from '@/core/effect';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Async Propagation Flow (Virtualization)', () => {
  it('demonstrates error propagation stopping the chain', async () => {
    const events: string[] = [];
    const shouldFail = atom(false);
    
    // Upstream
    const upstream = computed(async () => {
       const fail = shouldFail.value;
       await delay(10);
       if (fail) throw new Error('Boom');
       return 'Success';
    }, { 
        defaultValue: 'Loading',
        onError: (e) => console.log('DEBUG: Upstream Error:', e.message)
    });

    // Downstream
    const downstream = computed(async () => {
      // Propagation Check
      if (upstream.hasError) {
          console.log('DEBUG: Downstream sees Upstream Error');
          throw upstream.lastError;
      }

      try {
          const val = upstream.value;
          return `Processed(${val})`;
      } catch (e) {
          console.log('DEBUG: Downstream Caught Internal:', e);
          throw e; 
      }
    }, { 
        defaultValue: 'Waiting',
        onError: (e) => console.log('DEBUG: Downstream Error:', e.message)
    });

    effect(() => {
        console.log(`DEBUG: Effect Run. UpState=${upstream.state} DownState=${downstream.state}`);
        try {
            const _ = downstream.value;
            events.push(`Effect: Up[${upstream.state}] / Down[${downstream.state}]`);
        } catch (e) {
            events.push(`Effect: Up[${upstream.state}] / Down[${downstream.state}] (Error)`);
        }
    });

    await delay(20);
    console.log('--- Initial Settle ---');
    events.length = 0;

    shouldFail.value = true;
    console.log('--- Trigger Failure ---');
    
    await delay(50);
    console.log('--- End Wait ---');

    console.log('Events:', events);

    const hasPending = events.some(e => e.includes('Up[pending]'));
    expect(hasPending).toBe(true);
    
    const lastEvent = events[events.length - 1];
    expect(lastEvent).toContain('Up[rejected] / Down[rejected]');
  });
});
