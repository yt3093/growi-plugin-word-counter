declare global {
  interface Window {
    pluginActivators?: Record<string, { activate(): void; deactivate(): void }>;
  }
}

/**
 * ページ本文から算出する各種統計値。
 * 初期実装では charsWithSpaces のみ表示するが、
 * 将来的な拡張（単語数・読了時間など）を見越して全項目を計算しておく。
 */
export interface PageStats {
  /** 文字数（空白・改行を含む） */
  charsWithSpaces: number;
  /** 文字数（空白・改行を除く） */
  charsNoSpaces: number;
  /** 単語数（空白区切り） */
  words: number;
  /** 読了時間の目安（分、切り上げ・最小1分） */
  readingMinutes: number;
}

/** SVG アイコンを構成する1つの図形要素（line / rect / circle / text 等） */
export interface SvgShapeDef {
  tag: string;
  attrs: Record<string, string>;
  /** `<text>` 等、テキストコンテンツを持つ要素にのみ指定する */
  text?: string;
}

export {};
