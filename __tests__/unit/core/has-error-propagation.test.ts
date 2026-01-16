import { describe, expect, it } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { effect } from '@/core/effect';
import { AsyncState } from '@/constants';
import { sleep, tick } from '../../utils/test-helpers';

describe('hasError Propagation (Async Computed Chain)', () => {
  describe('GitHub Stats Pipeline Pattern', () => {
    it('hasError propagates through dependency chain when upstream fails', async () => {
      const shouldFail = atom(false);
      const runId = atom(0);

      // Stage 1: Fetch User
      const user = computed(async () => {
        const _id = runId.value;
        if (_id === 0) return null;
        await sleep(20);
        return { login: 'octocat', name: 'The Octocat' };
      }, { defaultValue: null as { login: string; name: string } | null });

      // Stage 2: Fetch Repos (may fail)
      const repos = computed(async () => {
        const userData = user.value;
        if (!userData) return null;
        await sleep(20);
        if (shouldFail.value) {
          throw new Error('API Rate Limit Exceeded');
        }
        return [{ name: 'repo1', stars: 100 }];
      }, { defaultValue: null as { name: string; stars: number }[] | null });

      // Stage 3: Calculate Stats (depends on repos)
      const stats = computed(async () => {
        const repoList = repos.value;
        if (!repoList) return null;
        return { totalStars: repoList.reduce((sum, r) => sum + r.stars, 0) };
      }, { defaultValue: null as { totalStars: number } | null });

      // Subscribe to trigger evaluation
      effect(() => {
        try { stats.value; } catch {}
      });

      // Trigger success run
      runId.value = 1;
      await sleep(100);
      await tick();

      expect(user.state).toBe(AsyncState.RESOLVED);
      expect(repos.state).toBe(AsyncState.RESOLVED);
      expect(stats.state).toBe(AsyncState.RESOLVED);
      expect(stats.hasError).toBe(false);
      expect(stats.value).toEqual({ totalStars: 100 });

      // Trigger failure
      shouldFail.value = true;
      runId.value = 2;
      await sleep(100);
      await tick();

      // User succeeds
      expect(user.state).toBe(AsyncState.RESOLVED);
      expect(user.hasError).toBe(false);

      // Repos fails
      expect(repos.state).toBe(AsyncState.REJECTED);
      expect(repos.hasError).toBe(true);
      expect(repos.lastError?.message).toContain('API Rate Limit Exceeded');

      // Stats: state is RESOLVED (with null), but hasError is TRUE
      // This is the key behavior: hasError propagates through chain!
      expect(stats.state).toBe(AsyncState.RESOLVED);
      expect(stats.lastError).toBe(null); // No own error
      expect(stats.hasError).toBe(true);  // But upstream has error!
      
      // errors array contains upstream errors
      expect(stats.errors.length).toBeGreaterThanOrEqual(1);
      expect(stats.errors.some(e => e.message.includes('API Rate Limit Exceeded'))).toBe(true);
    });

    it('UI can detect blocked state via hasError && !lastError', async () => {
      const shouldFail = atom(true);

      const upstream = computed(async () => {
        await sleep(20);
        if (shouldFail.value) throw new Error('Upstream failed');
        return 'success';
      }, { defaultValue: null });

      const downstream = computed(async () => {
        const val = upstream.value;
        if (!val) return 'waiting';
        return `processed: ${val}`;
      }, { defaultValue: 'waiting' });

      // Subscribe
      effect(() => {
        try { downstream.value; } catch {}
      });

      await sleep(50);
      await tick();

      // Upstream rejected
      expect(upstream.state).toBe(AsyncState.REJECTED);
      expect(upstream.hasError).toBe(true);
      expect(upstream.lastError?.message).toContain('Upstream failed');

      // Downstream resolved (with defaultValue 'waiting') but knows about upstream error
      expect(downstream.state).toBe(AsyncState.RESOLVED);
      expect(downstream.lastError).toBe(null);
      expect(downstream.hasError).toBe(true);

      // This is how UI detects "blocked" state:
      const isBlocked = downstream.hasError && downstream.lastError === null;
      expect(isBlocked).toBe(true);
    });

    it('hasError clears when upstream error is fixed', async () => {
      const shouldFail = atom(true);
      const trigger = atom(1);

      const upstream = computed(async () => {
        const _t = trigger.value;
        await sleep(20);
        if (shouldFail.value) throw new Error('Upstream failed');
        return 'success';
      }, { defaultValue: null });

      const downstream = computed(async () => {
        const val = upstream.value;
        if (!val) return null;
        return `processed: ${val}`;
      }, { defaultValue: null });

      // Subscribe
      effect(() => {
        try { downstream.value; } catch {}
      });

      await sleep(50);
      await tick();

      expect(upstream.hasError).toBe(true);
      expect(downstream.hasError).toBe(true);

      // Fix the error
      shouldFail.value = false;
      trigger.value = 2;

      await sleep(50);
      await tick();

      expect(upstream.state).toBe(AsyncState.RESOLVED);
      expect(upstream.hasError).toBe(false);
      expect(downstream.state).toBe(AsyncState.RESOLVED);
      expect(downstream.hasError).toBe(false);
      expect(downstream.value).toBe('processed: success');
    });
  });

  describe('errors array accumulation', () => {
    it('errors array collects all upstream errors', async () => {
      const source1 = computed(async () => {
        await sleep(10);
        throw new Error('Source 1 failed');
      }, { defaultValue: null });

      const source2 = computed(async () => {
        await sleep(10);
        throw new Error('Source 2 failed');
      }, { defaultValue: null });

      // Wait for sources to reject
      effect(() => { try { source1.value; } catch {} });
      effect(() => { try { source2.value; } catch {} });
      await sleep(30);
      await tick();

      expect(source1.hasError).toBe(true);
      expect(source2.hasError).toBe(true);

      // Combined - accesses both failed sources
      const combined = computed(() => {
        return `${source1.value} + ${source2.value}`;
      }, { defaultValue: 'pending' });

      // Trigger combined
      effect(() => { try { combined.value; } catch {} });
      await tick();

      // combined.hasError should be true (from both sources)
      expect(combined.hasError).toBe(true);

      // errors should contain errors from both sources
      expect(combined.errors.some(e => e.message.includes('Source 1 failed'))).toBe(true);
      expect(combined.errors.some(e => e.message.includes('Source 2 failed'))).toBe(true);
    });
  });
});
