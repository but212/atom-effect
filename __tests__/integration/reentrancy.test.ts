
import { describe, it, expect, vi } from 'vitest';
import { atom, effect, batch } from '@/index';
import { scheduler, SchedulerPhase } from '@/scheduler/scheduler';

describe('Scheduler Re-entrancy & Phases', () => {
  it('reports correct phase during execution', async () => {
    const a = atom(0);
    let phaseInEffect: SchedulerPhase | null = null;

    effect(() => {
      a.value;
      phaseInEffect = scheduler.phase;
    });

    // Initial run is synchronous inside effect() call? 
    // Wait, effect() runs immediately.
    // However, during execution, is it flushing?
    // If sync: true, it runs immediately.
    // If sync: false, it runs immediately (setup) but updates are scheduled.
    
    // During initial run, we are inside `effect.execute()`. 
    // Scheduler is not necessarily flushing, unless effect was triggered by flush.
    // Let's force a flush.
    
    a.value = 1;
    await new Promise(r => setTimeout(r, 0));
    
    // When a.value = 1, scheduler queues the effect.
    // await tick -> scheduler.flush() runs.
    // Inside flush(), phase should be FLUSHING.
    
    expect(phaseInEffect).toBe(SchedulerPhase.FLUSHING);
  });

  it('handles nested updates correctly (Effect -> Atom -> Effect)', async () => {
    const trigger = atom(0);
    const reactor = atom(0);
    const logs: string[] = [];

    effect(() => {
      logs.push(`trigger: ${trigger.value}`);
      if (trigger.value > 0 && trigger.value < 3) {
        reactor.value = trigger.value; // Write during read?
      }
    });

    effect(() => {
      logs.push(`reactor: ${reactor.value}`);
    });

    trigger.value = 1;
    await new Promise(r => setTimeout(r, 0));

    // trigger: 1 captures first.
    // reactor.value = 1 -> queues reactor effect.
    // trigger effect finishes.
    // reactor effect runs.
    
    expect(logs).toContain('trigger: 1');
    expect(logs).toContain('reactor: 1');
  });

  it('reports BATCHING phase', () => {
    let phaseInBatch: SchedulerPhase | null = null;

    batch(() => {
      phaseInBatch = scheduler.phase;
    });

    expect(phaseInBatch).toBe(SchedulerPhase.BATCHING);
  });
});
