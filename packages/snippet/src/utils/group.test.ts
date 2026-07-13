import { describe, expect, it } from 'vitest';
import type { SearchResult } from '../types/index.ts';
import { groupResultsByMetadata } from './index.ts';

function result(id: string, group?: unknown): SearchResult {
  return {
    id,
    title: id,
    description: '',
    type: 'result',
    metadata: group === undefined ? undefined : { group },
  };
}

describe('result grouping', () => {
  it('preserves first-seen group and member order', () => {
    const groups = groupResultsByMetadata(
      [result('1', 'a'), result('2', 'b'), result('3', 'a'), result('4', 'b')],
      'group',
      'Other'
    );

    expect(groups.map(({ key }) => key)).toEqual(['a', 'b']);
    expect(groups.map(({ results }) => results.map(({ id }) => id))).toEqual([
      ['1', '3'],
      ['2', '4'],
    ]);
  });

  it('uses the localized fallback for missing and empty values', () => {
    const groups = groupResultsByMetadata(
      [result('1'), result('2', ''), result('3', '   '), result('4', null)],
      'group',
      'Ungrouped'
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('Ungrouped');
    expect(groups[0].results.map(({ id }) => id)).toEqual(['1', '2', '3', '4']);
  });

  it('stringifies non-string group values', () => {
    const groups = groupResultsByMetadata(
      [result('1', 2), result('2', 3), result('3', 2)],
      'group'
    );

    expect(groups.map(({ key }) => key)).toEqual(['2', '3']);
    expect(groups[0].results.map(({ id }) => id)).toEqual(['1', '3']);
  });

  it('returns an empty array for no results', () => {
    expect(groupResultsByMetadata([], 'group', 'Other')).toEqual([]);
  });
});
