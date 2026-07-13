import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchResult } from '../types/index.ts';
import {
  loadStoredResults,
  RECENT_RESULTS_STORAGE_KEY,
  storeRecentResult,
} from './stored-results.ts';

const firstResult: SearchResult = {
  id: 'first',
  title: 'First result',
  description: 'The first result',
  url: 'https://example.com/first',
  type: 'result',
};

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('stored results', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
  });

  it('stores the most recently clicked result first and removes duplicates', () => {
    const secondResult = { ...firstResult, id: 'second', url: 'https://example.com/second' };

    storeRecentResult(firstResult);
    storeRecentResult(secondResult);
    const results = storeRecentResult(firstResult);

    expect(results.map((result) => result.id)).toEqual(['first', 'second']);
    expect(loadStoredResults(RECENT_RESULTS_STORAGE_KEY)).toEqual(results);
  });

  it('limits the number of stored results', () => {
    for (let index = 0; index < 7; index++) {
      storeRecentResult({ ...firstResult, id: `${index}`, url: `https://example.com/${index}` });
    }

    expect(loadStoredResults(RECENT_RESULTS_STORAGE_KEY).map((result) => result.id)).toEqual([
      '6',
      '5',
      '4',
      '3',
      '2',
    ]);
  });

  it('ignores malformed and inaccessible storage', () => {
    localStorage.setItem(RECENT_RESULTS_STORAGE_KEY, '{invalid');
    expect(loadStoredResults(RECENT_RESULTS_STORAGE_KEY)).toEqual([]);

    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Storage unavailable');
      },
      setItem: () => {
        throw new Error('Storage unavailable');
      },
    });
    expect(loadStoredResults(RECENT_RESULTS_STORAGE_KEY)).toEqual([]);
    expect(storeRecentResult(firstResult)).toEqual([firstResult]);
  });
});
