declare global {
  interface Window {
    pluginActivators?: Record<string, { activate(): void; deactivate(): void }>;
  }
}

/**
 * ページ本文から算出する各種統計値。
 * UI 側で表示する指標を選ぶかどうかに関わらず、常に全項目を計算する。
 */
export interface PageStats {
  /** 文字数（空白・改行を含む） */
  charsWithSpaces: number;
  /** 文字数（空白・改行を除く） */
  charsNoSpaces: number;
  /** 単語数（`Intl.Segmenter` による言語非依存の単語分割。未対応環境では空白区切りにフォールバック） */
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
