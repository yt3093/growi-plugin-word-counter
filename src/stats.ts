import type { PageStats } from './types';

/** 読了時間目安の算出に使う 1 分あたりの想定文字数（日本語想定） */
const CHARS_PER_MINUTE = 500;

/**
 * 単語数を数える。`Intl.Segmenter` が使える環境では言語非依存の単語分割
 * （日本語のようにスペース区切りが無い言語でも意味のある単語単位に分割）を行う。
 * 未対応環境（古いブラウザ等）ではスペース区切りにフォールバックする。
 */
const countWords = (text: string): number => {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
    let count = 0;
    for (const segment of segmenter.segment(text)) {
      if (segment.isWordLike) count += 1;
    }
    return count;
  }

  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
};

/**
 * 本文テキストから各種統計値をまとめて算出する純粋関数。
 * UI 側でどの指標を表示するかとは独立して、常に全項目を計算する。
 */
export const computeStats = (text: string): PageStats => {
  // サロゲートペア（絵文字等）を1文字として数えるため Array.from を使う
  const charsWithSpaces = Array.from(text).length;

  const noSpaceText = text.replace(/\s/g, '');
  const charsNoSpaces = Array.from(noSpaceText).length;

  const words = countWords(text);

  const readingMinutes = Math.max(1, Math.ceil(charsNoSpaces / CHARS_PER_MINUTE));

  return { charsWithSpaces, charsNoSpaces, words, readingMinutes };
};
