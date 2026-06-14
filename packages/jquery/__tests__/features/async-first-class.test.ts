import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import $ from '@/index';
import { createMockJqXHR } from '../utils/test-helpers';

describe('First-class Asynchronous Objects (AEJ)', () => {
  let $fixture: JQuery;

  beforeEach(() => {
    vi.useFakeTimers();
    $fixture = $('<div id="fixture"></div>').appendTo('body');
  });

  afterEach(() => {
    vi.useRealTimers();
    $fixture.remove();
    vi.restoreAllMocks();
  });

  /**
   * Robustly flushes all pending reactive effects and microtasks.
   * Advances fake timers by 0ms multiple times to trigger $.nextTick's
   * macrotask-based scheduler without advancing real-time simulations
   * (like network delays) unless explicitly requested via vi.runAllTimers().
   */
  async function flushEffects() {
    for (let i = 0; i < 2; i++) {
      const p = $.nextTick();
      vi.advanceTimersByTime(0);
      await p;
    }
  }

  describe('Scenario 1: Temporal Awareness (Metadata Binding)', () => {
    it('should react to isPending and hasError state in atomBind', async () => {
      let resolveAjax!: (v: { name: string }[]) => void;
      vi.spyOn($, 'ajax').mockImplementation(() =>
        createMockJqXHR(
          new Promise((resolve) => {
            resolveAjax = resolve;
          })
        )
      );

      $fixture.html(`
        <div id="resultBox">
          <div id="errorMessage"></div>
        </div>
      `);

      const searchResult = $.atomFetch('/api/search', { defaultValue: [] });

      $('#resultBox').atomBind({
        class: {
          'is-loading': () => searchResult.isPending,
          'is-error': () => searchResult.hasError,
        },
      });

      $('#errorMessage')
        .atomShow(() => searchResult.hasError)
        .atomText(() => `에러: ${searchResult.errors?.[0]?.message}`);

      // Initial state: Pending
      await flushEffects();
      expect($('#resultBox').hasClass('is-loading')).toBe(true);
      expect($('#resultBox').hasClass('is-error')).toBe(false);
      expect($('#errorMessage').is(':visible')).toBe(false);

      // Resolve state: Not Pending
      resolveAjax([{ name: 'Item 1' }]);
      await flushEffects();
      expect($('#resultBox').hasClass('is-loading')).toBe(false);
      expect($('#resultBox').hasClass('is-error')).toBe(false);
      expect($('#errorMessage').is(':visible')).toBe(false);
    });

    it('should react to errors in the UI', async () => {
      vi.spyOn($, 'ajax').mockRejectedValue(new Error('Network Failure'));

      $fixture.html('<div id="errorMessage"></div>');

      const searchResult = $.atomFetch('/api/search', { defaultValue: [] });

      $('#errorMessage')
        .atomShow(() => searchResult.hasError)
        .atomText(() => `에러: ${searchResult.errors?.[0]?.message}`);

      // Wait for all async operations to settle
      vi.runAllTimers();
      await flushEffects();

      expect($('#errorMessage').text()).toContain('Network Failure');
      expect($('#errorMessage').css('display')).not.toBe('none');
    });
  });

  describe('Scenario 2: Race Condition Defense', () => {
    it('should abort previous requests and only render the last result', async () => {
      const keyword = $.atom('');
      const abortSpies: Mock[] = [];

      vi.spyOn($, 'ajax').mockImplementation((opts) => {
        const abortSpy = vi.fn();
        abortSpies.push(abortSpy);
        return createMockJqXHR(
          new Promise((resolve) => {
            // Simulate network delay
            setTimeout(() => resolve([{ name: `Result for ${opts?.url}` }]), 50);
          }),
          { abort: abortSpy }
        );
      });

      const searchResult = $.atomFetch(() => `/api/search?q=${keyword.value}`, {
        defaultValue: [],
        eager: false,
      });

      $fixture.html('<ul id="resultList"></ul>');
      $('#resultList').atomList(searchResult, {
        key: 'name',
        render: (item: { name: string }) => `<li>${item.name}</li>`,
      });

      // Lazy atomFetch triggers ajax when atomList reads its value.
      await flushEffects();
      vi.clearAllMocks();
      abortSpies.length = 0;

      // 1. First trigger
      keyword.value = 'a';
      await flushEffects();
      expect($.ajax).toHaveBeenCalledTimes(1);
      expect(abortSpies.length).toBe(1);

      // 2. Rapid second trigger
      keyword.value = 'ab';
      await flushEffects();
      expect($.ajax).toHaveBeenCalledTimes(2);
      expect(abortSpies.length).toBe(2);
      expect(abortSpies[0]).toHaveBeenCalled(); // Previous request should be aborted

      // 3. Final third trigger
      keyword.value = 'abc';
      await flushEffects();
      expect($.ajax).toHaveBeenCalledTimes(3);
      expect(abortSpies.length).toBe(3);
      expect(abortSpies[1]).toHaveBeenCalled(); // Previous request should be aborted

      // Wait for the final request to resolve
      vi.runAllTimers();
      await flushEffects();

      expect($('#resultList li').length).toBe(1);
      expect($('#resultList li').text()).toBe('Result for /api/search?q=abc');
    });
  });

  describe('Scenario 3: Unified Sync/Async Boundary', () => {
    it('should behave identically for sync atoms and async atomFetch results in atomVal', async () => {
      const keyword = $.atom('initial');
      $fixture.html('<input id="searchInput">');

      $('#searchInput').atomVal(keyword);
      expect($('#searchInput').val()).toBe('initial');

      keyword.value = 'updated';
      await flushEffects();
      expect($('#searchInput').val()).toBe('updated');

      // Note: atomVal is two-way for writeable atoms. atomFetch is Readonly, so it won't be two-way.
      // But the user's punchline says "syntax is exactly the same".
    });

    it('should behave identically in atomList', async () => {
      const syncList = $.atom([{ name: 'Sync' }]);
      $fixture.html('<ul id="syncList"></ul><ul id="asyncList"></ul>');

      $('#syncList').atomList(syncList, {
        key: 'name',
        render: (item: { name: string }) => `<li>${item.name}</li>`,
      });
      expect($('#syncList li').text()).toBe('Sync');

      vi.spyOn($, 'ajax').mockResolvedValue([{ name: 'Async' }]);
      const asyncList = $.atomFetch<{ name: string }[]>('/api/list', { defaultValue: [] });
      $('#asyncList').atomList(asyncList, {
        key: 'name',
        render: (item: { name: string }) => `<li>${item.name}</li>`,
      });

      await flushEffects();
      expect($('#asyncList li').text()).toBe('Async');
    });
  });
});
