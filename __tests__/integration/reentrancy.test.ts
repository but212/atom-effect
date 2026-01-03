import { describe, expect, it } from 'vitest';
import { atom, batch, effect } from '@/index';
import { SchedulerPhase, scheduler } from '@/scheduler/scheduler';

describe('Scheduler Re-entrancy & Phases', () => {
  it('reports correct phase during execution', async () => {
    const a = atom(0);
    let phaseInEffect: SchedulerPhase | null = null;

    effect(() => {
      a.value;
      phaseInEffect = scheduler.phase;
    });

    a.value = 1;
    await new Promise((r) => setTimeout(r, 0));

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
    await new Promise((r) => setTimeout(r, 0));

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
