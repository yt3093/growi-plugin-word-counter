import { describe, expect, it } from 'vitest';
import { aggregateHeadingCounts } from './headingCounts';

describe('aggregateHeadingCounts', () => {
  it('returns an empty array for no headings', () => {
    expect(aggregateHeadingCounts([])).toEqual([]);
  });

  it('a single heading has no children and totalCount equals ownCount', () => {
    const result = aggregateHeadingCounts([{ level: 1, ownCount: 5 }]);
    expect(result).toEqual([{ ownCount: 5, totalCount: 5, hasChildren: false }]);
  });

  it('nested h1 > h2 > h3: parents include all descendants, leaf has no denominator concept (hasChildren=false)', () => {
    // ユーザー提示の例: h1:5字, h2:6字, h3:3字 → h1=5/14, h2=6/9, h3=3
    const result = aggregateHeadingCounts([
      { level: 1, ownCount: 5 },
      { level: 2, ownCount: 6 },
      { level: 3, ownCount: 3 },
    ]);
    expect(result).toEqual([
      { ownCount: 5, totalCount: 14, hasChildren: true },
      { ownCount: 6, totalCount: 9, hasChildren: true },
      { ownCount: 3, totalCount: 3, hasChildren: false },
    ]);
  });

  it('sibling headings at the same level are only aggregated into their shared ancestor, not into each other', () => {
    // ユーザー提示の例: h1:5字, h2①:3字, h2②:2字 → h1=5/10, h2①=3, h2②=2
    const result = aggregateHeadingCounts([
      { level: 1, ownCount: 5 },
      { level: 2, ownCount: 3 },
      { level: 2, ownCount: 2 },
    ]);
    expect(result).toEqual([
      { ownCount: 5, totalCount: 10, hasChildren: true },
      { ownCount: 3, totalCount: 3, hasChildren: false },
      { ownCount: 2, totalCount: 2, hasChildren: false },
    ]);
  });

  it('handles heading levels that skip (h1 directly followed by h3, no h2)', () => {
    const result = aggregateHeadingCounts([
      { level: 1, ownCount: 5 },
      { level: 3, ownCount: 3 },
    ]);
    // h3 はレベルが飛んでいても h1 の子として扱われる（スタックが h1 だけ残るため）
    expect(result).toEqual([
      { ownCount: 5, totalCount: 8, hasChildren: true },
      { ownCount: 3, totalCount: 3, hasChildren: false },
    ]);
  });

  it('multiple top-level (h1) sections are independent of each other', () => {
    const result = aggregateHeadingCounts([
      { level: 1, ownCount: 5 },
      { level: 2, ownCount: 3 },
      { level: 1, ownCount: 7 },
    ]);
    expect(result).toEqual([
      { ownCount: 5, totalCount: 8, hasChildren: true },
      { ownCount: 3, totalCount: 3, hasChildren: false },
      { ownCount: 7, totalCount: 7, hasChildren: false },
    ]);
  });

  it('deep nesting (h1 > h2 > h3 > h4) aggregates through every level', () => {
    const result = aggregateHeadingCounts([
      { level: 1, ownCount: 1 },
      { level: 2, ownCount: 2 },
      { level: 3, ownCount: 3 },
      { level: 4, ownCount: 4 },
    ]);
    expect(result.map((r) => r.totalCount)).toEqual([10, 9, 7, 4]);
    expect(result.map((r) => r.hasChildren)).toEqual([true, true, true, false]);
  });

  it('a heading with zero own content is still aggregated correctly', () => {
    const result = aggregateHeadingCounts([
      { level: 1, ownCount: 0 },
      { level: 2, ownCount: 5 },
    ]);
    expect(result).toEqual([
      { ownCount: 0, totalCount: 5, hasChildren: true },
      { ownCount: 5, totalCount: 5, hasChildren: false },
    ]);
  });
});
