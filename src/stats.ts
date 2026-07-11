import type { PageStats } from './types';

/** 読了時間目安の算出に使う 1 分あたりの想定文字数（日本語想定） */
const CHARS_PER_MINUTE = 500;

/**
 * 本文テキストから各種統計値をまとめて算出する純粋関数。
 * UI 側でどの指標を表示するかとは独立して、常に全項目を計算する。
 */
export const computeStats = (text: string): PageStats => {
  // サロゲートペア（絵文字等）を1文字として数えるため Array.from を使う
  const charsWithSpaces = Array.from(text).length;

  const noSpaceText = text.replace(/\s/g, '');
  const charsNoSpaces = Array.from(noSpaceText).length;

  const trimmed = text.trim();
  const words = trimmed === '' ? 0 : trimmed.split(/\s+/).length;

  const readingMinutes = Math.max(1, Math.ceil(charsNoSpaces / CHARS_PER_MINUTE));

  return { charsWithSpaces, charsNoSpaces, words, readingMinutes };
};
