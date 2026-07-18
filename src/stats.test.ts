import { describe, expect, it } from 'vitest';
import { computeStats } from './stats';

describe('computeStats', () => {
  it('counts characters including whitespace and newlines', () => {
    expect(computeStats('a b\nc').charsWithSpaces).toBe(5);
  });

  it('counts characters excluding whitespace and newlines', () => {
    expect(computeStats('a b\nc').charsNoSpaces).toBe(3);
  });

  it('counts surrogate pairs (emoji) as a single character each', () => {
    expect(computeStats('🎉🎊✨').charsWithSpaces).toBe(3);
  });

  it('returns zeros for an empty string, but floors reading time at 1 minute', () => {
    const stats = computeStats('');
    expect(stats.charsWithSpaces).toBe(0);
    expect(stats.charsNoSpaces).toBe(0);
    expect(stats.words).toBe(0);
    expect(stats.readingMinutes).toBe(1);
  });

  it('scales reading minutes from charsNoSpaces at 500 chars/min, rounded up', () => {
    expect(computeStats('あ'.repeat(1000)).readingMinutes).toBe(2);
    expect(computeStats('あ'.repeat(500)).readingMinutes).toBe(1);
    expect(computeStats('あ'.repeat(501)).readingMinutes).toBe(2);
  });

  describe('countWords (via Intl.Segmenter)', () => {
    it('segments Japanese text with no spaces into multiple words', () => {
      // GROWI 想定の日本語段落。スペース区切りでは 1 語にしかならない文章が、
      // Intl.Segmenter では意味のある単位に分割されることを確認する。
      expect(computeStats('これは最初の段落です').words).toBeGreaterThan(1);
    });

    it('separates words at a script boundary even without a space between them', () => {
      // 「東京」「Tokyo」「です」の3語（漢字/かな⇔ラテン文字の切り替わりで自動分割される）
      expect(computeStats('東京Tokyoです').words).toBe(3);
    });

    it('does NOT separate same-script words that touch without a space (known limitation)', () => {
      // ブロック境界の区切り(\n)が無いと "IntroductionThis" は1語として結合される。
      // extractTextWithBlockBreaks 側の区切り挿入で回避する必要がある既知の制約を記録する。
      expect(computeStats('IntroductionThis is a test').words).toBe(4);
    });

    it('counts standalone digits as word-like tokens', () => {
      expect(computeStats('1\n2\n3\n4').words).toBe(4);
    });
  });
});
