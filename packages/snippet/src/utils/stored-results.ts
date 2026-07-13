import type { SearchResult } from '../types/index.ts';

export const RECENT_RESULTS_STORAGE_KEY = 'search-snippet:recent-results';
export const DEFAULT_STORED_RESULTS_LIMIT = 5;

function isSearchResult(value: unknown): value is SearchResult {
  if (!value || typeof value !== 'object') return false;

  const result = value as Partial<SearchResult>;
  return (
    result.type === 'result' &&
    typeof result.id === 'string' &&
    typeof result.title === 'string' &&
    typeof result.description === 'string' &&
    (result.url === undefined || typeof result.url === 'string') &&
    (result.image === undefined || typeof result.image === 'string') &&
    (result.timestamp === undefined || typeof result.timestamp === 'number') &&
    (result.metadata === undefined ||
      (typeof result.metadata === 'object' && result.metadata !== null))
  );
}

function getResultKey(result: SearchResult): string {
  return result.url || result.id;
}

export function loadStoredResults(storageKey: string): SearchResult[] {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return [];

    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isSearchResult) : [];
  } catch {
    return [];
  }
}

export function storeRecentResult(
  result: SearchResult,
  storageKey = RECENT_RESULTS_STORAGE_KEY,
  limit = DEFAULT_STORED_RESULTS_LIMIT
): SearchResult[] {
  const resultKey = getResultKey(result);
  const recentResults = loadStoredResults(storageKey).filter(
    (storedResult) => getResultKey(storedResult) !== resultKey
  );
  const updatedResults = [result, ...recentResults].slice(0, Math.max(0, limit));

  try {
    localStorage.setItem(storageKey, JSON.stringify(updatedResults));
  } catch {
    // Storage can be unavailable or full. Keep search result navigation working.
  }

  return updatedResults;
}
