import './styles/wordCounter.css';
import { computeStats } from './stats';
import { aggregateHeadingCounts } from './headingCounts';
import type { HeadingCountInput, HeadingCountMetric, HeadingCountResult } from './headingCounts';
import type { PageStats, SvgShapeDef } from './types';

const WIDGET_CLASS = 'gpwc-widget';
const HEADING_BADGE_CLASS = 'gpwc-heading-badge';
const ENHANCED_ATTR = 'data-gpwc-enhanced';
const NO_COUNT_ATTR = 'data-no-wordcount';
const NAVIGATE_EVENT = 'growi-pwc-navigate';
const LOG_PREFIX = '[growi-plugin-word-counter]';

// GROWI はレンダリング済み本文を `.wiki` に描画する。
// コメント欄の各コメント本文も `<div class="page-comment-body"><div class="wiki comment">...`
// という構造で `.wiki` クラスを持つ（実機確認済み）。`.wiki` だけで検索すると、ページに
// コメントが付いている場合に複数ヒットしてしまう。DOM 順（通常は本文が先・コメントが下）に
// 依存せず確実に本文側だけを選ぶため、コメント側に付く `comment` クラスを明示的に除外する。
const WIKI_SELECTOR = '.wiki:not(.comment)';

// カウント対象から完全除外する要素のセレクタ。
// コードブロックは GROWI が `<pre><div>...<code>` という構造でレンダリングするため
// `pre` を除外すれば内部の `<code>` ごと除去できる（インラインコードの `<code>` は対象外）。
//
// drawio ブロックは `<div class="drawio-viewer ...">` 配下に `data-mxgraph` 属性として
// 図面 XML を保持する（属性値なので textContent には元々含まれない）が、SVG 内の
// `<foreignObject><div>` として図形ラベルの実テキストノードが存在し、これはカウントに
// 混入してしまうため要素ごと除外する。`_drawio-viewer_xxxxx_N` という CSS Modules 由来の
// ハッシュ付きクラスはバージョンで変わりうるため使わず、素の `drawio-viewer` を使う。
//
// KaTeX 数式は `<span class="katex">`（インライン）/ `<span class="katex-display"><span class="katex">`
// （ブロック）としてレンダリングされる。`.katex` 配下には
//   - `.katex-mathml`: スクリーンリーダー向けの隠し MathML 層。中の <annotation> に
//     生の TeX ソース（`\begin{pmatrix}...` 等）がテキストノードとして残る
//   - `.katex-html`: 実際に画面表示される層。同じ数字・記号を再度テキストノードとして持つ
// の2層があり、同じ内容が重複して textContent に含まれるため素朴に数えると二重カウントに
// なる。`.katex` ごと除外することで二重カウントと TeX ソース混入の両方を解消する。
//
// GROWI は見出し（h1-h6）の中にパーマリンクアンカーを挿入する:
//   - `.revision-head-link`: テキストとして `#` を持つ
//
// `.material-symbols-outlined`: Material Symbols フォントのリガチャ表示用クラス。
// 見た目はアイコン1つでも DOM 上は `edit_square` 等の英単語が生テキストとして入っている。
// 見出しの編集ボタン（`.revision-head-edit-button` 配下）・表の編集ボタン
// （`.handsontable-modal-trigger` 配下）など、GROWI の各種編集ボタンで繰り返し使われるため、
// 個別のボタンクラスを追いかけるのではなくアイコンフォント自体を一括除外する。
//
// 脚注（footnote）は本文中の参照マーカー（`<sup><a data-footnote-ref>1</a></sup>`、
// テキストは連番の数字）と、脚注一覧末尾の戻りリンク（`<a data-footnote-backref>↩</a>`、
// テキストは矢印記号）の2箇所に UI 用のテキストが入る。どちらも本文と無関係なので除外するが、
// 脚注そのものの内容テキスト（`<li>` 内の本文）は著者が書いた実コンテンツなので除外しない。
const EXCLUDED_SELECTORS = [
  'pre',
  '.drawio-viewer',
  '.katex',
  '.revision-head-link',
  '.material-symbols-outlined',
  '[data-footnote-ref]',
  '[data-footnote-backref]',
  // 見出しバッジ（後述）自身のテキスト（"6/9" 等）が本文カウントに混入しないよう除外する。
  // `pre` は既に除外対象のため、見出しカウント機能のオプトイン用マーカー（後述）も
  // 追加のセレクタなしで自動的にカバーされる。
  `.${HEADING_BADGE_CLASS}`,
];

// UI に表示する指標のフラグ。stats.ts では常に全指標を計算しているため、
// 将来的に単語数・読了時間を表示する場合はここを true にするだけでよい。
const SHOW_CHARS_WITH_SPACES = true;
const SHOW_CHARS_NO_SPACES = true;
const SHOW_WORDS = true;
const SHOW_READING_MINUTES = true;

let observer: MutationObserver | null = null;
let originalPushState: typeof history.pushState | null = null;
let originalReplaceState: typeof history.replaceState | null = null;
let navigateHandler: (() => void) | null = null;
let popstateHandler: (() => void) | null = null;
let hashchangeHandler: (() => void) | null = null;
let scanScheduled = false;

// `export` はテストから直接インポートするために付与している（client-entry.tsx は
// createWordCounter のみを使うため、バンドル済み dist/ には影響しない）。
export const isHiddenContext = (): boolean => {
  const path = window.location.pathname;
  const hash = window.location.hash;

  if (path === '/admin' || path.startsWith('/admin/')) return true;
  if (path.endsWith('/edit') || hash === '#edit') return true;

  const body = document.body;
  if (body.classList.contains('editing')) return true;
  if (body.classList.contains('grw-editor-mode')) return true;
  if (body.classList.contains('modal-open')) return true;

  return false;
};

const getMainWiki = (): HTMLElement | null => document.querySelector<HTMLElement>(WIKI_SELECTOR);

const getExistingWidget = (wiki: HTMLElement): HTMLElement | null =>
  wiki.querySelector<HTMLElement>(`:scope > .${WIDGET_CLASS}`);

// ブロックレベル要素の後には区切り文字を挿入してからテキストを収集する。
// `textContent` を素朴に使うと `<h2>見出し</h2><p>本文</p>` のような隣接ブロックの
// 境界に何も挟まらず「見出し本文」と連結されてしまい、単語区切り(words)が壊れるため。
const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'LI',
  'UL',
  'OL',
  'BLOCKQUOTE',
  'PRE',
  'TABLE',
  'TR',
  'TD',
  'TH',
  'THEAD',
  'TBODY',
  'TFOOT',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HR',
  'BR',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
  'FIGURE',
  'FIGCAPTION',
  'DL',
  'DT',
  'DD',
]);

export const extractTextWithBlockBreaks = (root: HTMLElement): string => {
  const parts: string[] = [];

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    node.childNodes.forEach(walk);
    if (BLOCK_TAGS.has((node as HTMLElement).tagName)) parts.push('\n');
  };

  root.childNodes.forEach(walk);

  // GROWI がタグ間に出力する整形用の改行テキストノードと、ここで挿入した区切りの `\n` が
  // 重なって連続する場合がある（例: `<blockquote>\n<p>a</p>\n</blockquote>`）。
  // 改行を含む空白の連続はブロック境界1つにつき改行1文字へ正規化し、
  // 先頭・末尾の余分な空白も trim して取り除く。
  return parts
    .join('')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
};

/**
 * 本文テキストを取得する。自分自身が注入したウィジェットの文字列と、
 * EXCLUDED_SELECTORS に該当する要素（コードブロックなど）はカウントに
 * 混入しないよう除外する。ブロック要素の境界には区切りを補って収集する。
 */
export const getBodyText = (wiki: HTMLElement): string => {
  const clone = wiki.cloneNode(true) as HTMLElement;
  clone.querySelector(`:scope > .${WIDGET_CLASS}`)?.remove();
  EXCLUDED_SELECTORS.forEach((selector) => {
    clone.querySelectorAll(selector).forEach((el) => el.remove());
  });
  return extractTextWithBlockBreaks(clone);
};

const SVG_NS = 'http://www.w3.org/2000/svg';

// 各指標のアイコンを構成する図形定義。24x24 viewBox で、円バッジ（currentColor 塗り）の
// 上に白抜き（stroke/fill: white）で重ねる前提の座標にしている（実際の描画は createSvgIcon）。
// 絵文字やアイコンフォントは使わず、`createElementNS` で自己完結の SVG として生成する。

// 初期案（横線3本 / 目盛り付きルーラー / 角丸ブロック3つ）は細い線を複数組み合わせた
// 抽象的な図形で、実表示サイズ（1em 前後）では潰れて視認性が低かったため、
// 単一の大きなモチーフで一目で判別できるデザインに変更した。

/** 文字数（空白含む）: 太字の「A」1文字＝文字を扱う指標であることを直接示す */
const ICON_CHARS: SvgShapeDef[] = [
  {
    tag: 'text',
    attrs: {
      // dominant-baseline のキーワード（central / middle）はブラウザ・フォント依存で
      // 上下にブレやすいため使わず、標準の alphabetic ベースラインのまま
      // y をキャップハイト分（font-size の約 0.72 の半分）だけ中心から下げて中央に合わせる。
      x: '12',
      y: '18.5',
      'text-anchor': 'middle',
      'font-size': '18',
      'font-weight': '700',
      fill: 'white',
      stroke: 'none',
    },
    text: 'A',
  },
];

/** 文字数（空白除く）: 内向きの矢印2本＝余白を詰める（圧縮する）イメージ */
const ICON_CHARS_NO_SPACE: SvgShapeDef[] = [
  { tag: 'line', attrs: { x1: '2', y1: '12', x2: '9', y2: '12', 'stroke-width': '2', 'stroke-linecap': 'round' } },
  {
    tag: 'polyline',
    attrs: { points: '6,8 9,12 6,16', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
  },
  { tag: 'line', attrs: { x1: '22', y1: '12', x2: '15', y2: '12', 'stroke-width': '2', 'stroke-linecap': 'round' } },
  {
    tag: 'polyline',
    attrs: { points: '18,8 15,12 18,16', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
  },
];

/** 単語数: 吹き出し（スピーチバブル）＝発話・言葉を表す */
const ICON_WORDS: SvgShapeDef[] = [
  { tag: 'rect', attrs: { x: '3', y: '4', width: '18', height: '12', rx: '3', 'stroke-width': '2' } },
  { tag: 'path', attrs: { d: 'M8 16 L7 20 L12 16 Z', 'stroke-width': '2', 'stroke-linejoin': 'round' } },
];

/** 読了時間: 時計 */
const ICON_CLOCK: SvgShapeDef[] = [
  { tag: 'circle', attrs: { cx: '12', cy: '12', r: '9', 'stroke-width': '2' } },
  { tag: 'line', attrs: { x1: '12', y1: '12', x2: '12', y2: '7', 'stroke-width': '2', 'stroke-linecap': 'round' } },
  { tag: 'line', attrs: { x1: '12', y1: '12', x2: '16', y2: '14', 'stroke-width': '2', 'stroke-linecap': 'round' } },
];

// アイコンは「currentColor の円バッジ + 白抜きの図形」で構成する。
// 図形自体は元々アイコン全体（24x24）を使う想定で座標を組んでいるため、円バッジ内に
// 収まるよう `scale(0.7)` で中心基準に縮小してから重ねる。
const createSvgIcon = (shapes: SvgShapeDef[]): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'gpwc-seg-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');

  const badge = document.createElementNS(SVG_NS, 'circle');
  badge.setAttribute('class', 'gpwc-seg-icon-bg');
  badge.setAttribute('cx', '12');
  badge.setAttribute('cy', '12');
  badge.setAttribute('r', '11');
  svg.appendChild(badge);

  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('transform', 'translate(12,12) scale(0.7) translate(-12,-12)');
  group.setAttribute('fill', 'none');
  group.setAttribute('stroke', 'white');
  shapes.forEach(({ tag, attrs, text }) => {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    if (text !== undefined) el.textContent = text;
    group.appendChild(el);
  });
  svg.appendChild(group);

  return svg;
};

const createSegment = (icon: SvgShapeDef[], text: string): HTMLSpanElement => {
  const seg = document.createElement('span');
  seg.className = 'gpwc-seg';
  seg.appendChild(createSvgIcon(icon));

  const label = document.createElement('span');
  label.className = 'gpwc-seg-text';
  label.textContent = text;
  seg.appendChild(label);

  return seg;
};

const buildWidget = (stats: PageStats): HTMLDivElement => {
  const widget = document.createElement('div');
  widget.className = WIDGET_CLASS;
  widget.setAttribute('role', 'status');
  widget.setAttribute('aria-label', `${stats.charsWithSpaces.toLocaleString()} characters`);

  if (SHOW_CHARS_WITH_SPACES) {
    widget.appendChild(createSegment(ICON_CHARS, `${stats.charsWithSpaces.toLocaleString()} chars`));
  }
  if (SHOW_CHARS_NO_SPACES) {
    widget.appendChild(createSegment(ICON_CHARS_NO_SPACE, `${stats.charsNoSpaces.toLocaleString()} chars (no spaces)`));
  }
  if (SHOW_WORDS) {
    widget.appendChild(createSegment(ICON_WORDS, `${stats.words.toLocaleString()} words`));
  }
  if (SHOW_READING_MINUTES) {
    widget.appendChild(createSegment(ICON_CLOCK, `~${stats.readingMinutes} min read`));
  }

  return widget;
};

const enhanceWiki = (wiki: HTMLElement): void => {
  const stats = computeStats(getBodyText(wiki));
  wiki.prepend(buildWidget(stats));
  wiki.setAttribute(ENHANCED_ATTR, '1');
};

const updateWiki = (wiki: HTMLElement): void => {
  const existing = getExistingWidget(wiki);
  if (!existing) {
    enhanceWiki(wiki);
    return;
  }
  const stats = computeStats(getBodyText(wiki));
  existing.replaceWith(buildWidget(stats));
};

const cleanupWiki = (wiki: HTMLElement): void => {
  getExistingWidget(wiki)?.remove();
  wiki.removeAttribute(ENHANCED_ATTR);
};

// 見出し単位カウント機能のオプトインマーカー。
// ページ本文に ```gpwc-headings:chars のようなコードフェンスを埋め込むと、その値
// （chars / chars-no-space / words）に応じて各見出しの隣にバッジを表示する。
//
// 実機確認の結果、GROWI 本体のフェンス言語パーサーは "gpwc-headings" をハイフンの位置で
// 区切り、`<code class="language-gpwc">` として言語クラスに反映する一方、コロン以降を含む
// 残り全体（例: "headings:chars"）は `<cite class="code-highlighted-title">` にそのまま
// 出力される（見出しの `<a class="revision-head-link">` 等と違い、コロンでの言語:ファイル名
// 分割は行われず、ハイフン区切りが優先される挙動だった）。この実機挙動に合わせて、
// `language-gpwc` を検出の起点にし、`<cite>` のテキストを "headings:" プレフィックスで
// 判定してから値を取り出す。
const HEADING_COUNT_LANG_SELECTOR = 'code[class*="language-gpwc"]';
const HEADING_COUNT_NAMESPACE = 'headings';
const HEADING_COUNT_HIDE_CLASS = 'gpwc-heading-count-marker';
const VALID_HEADING_METRICS: readonly HeadingCountMetric[] = ['chars', 'chars-no-space', 'words'];

const findHeadingCountMetric = (wiki: HTMLElement): HeadingCountMetric | null => {
  const codeEl = wiki.querySelector<HTMLElement>(HEADING_COUNT_LANG_SELECTOR);
  if (!codeEl) return null;

  // マーカー用のコードブロックは中身が空の設定用ブロックなので、見た目に残らないよう隠す。
  const pre = codeEl.closest('pre');
  pre?.classList.add(HEADING_COUNT_HIDE_CLASS);

  const cite = pre?.querySelector<HTMLElement>('cite.code-highlighted-title');
  const citeText = cite?.textContent?.trim() ?? '';
  const separatorIndex = citeText.indexOf(':');
  if (separatorIndex === -1) return null;

  const namespace = citeText.slice(0, separatorIndex).trim();
  const value = citeText.slice(separatorIndex + 1).trim();
  if (namespace !== HEADING_COUNT_NAMESPACE) return null;

  if ((VALID_HEADING_METRICS as readonly string[]).includes(value)) {
    return value as HeadingCountMetric;
  }

  // マーカー自体は見つかっている（namespace は一致）のに値が無効なケース。
  // マーカーが無いだけの「機能オフ」（正常な沈黙）と区別できるよう警告を出す。
  console.warn(
    `${LOG_PREFIX} invalid heading count metric "${value}". Expected one of: ${VALID_HEADING_METRICS.join(', ')}.`,
  );
  return null;
};

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

interface HeadingSection {
  element: HTMLElement;
  level: number;
  ownText: string;
}

/**
 * `.wiki` 内のすべての見出しを文書順に取得し、各見出しの「自身の内容」
 * （その見出しの直後から次の見出しの直前まで。見出しタイトル自体のテキストは含まない）を
 * 抽出する。`getBodyText` と同じく `EXCLUDED_SELECTORS` と `extractTextWithBlockBreaks` を使う。
 *
 * `.wiki` 直下の子要素だけでなく、`<blockquote>` 内などにネストされた見出し
 * （CommonMark 上は `> # 見出し` のように文法上可能）も見落とさないよう、
 * `querySelectorAll` で全深さの見出しを対象にし、`Range` API で境界を切り出す。
 * `Range.cloneContents()` は開始/終了点が異なる深さの祖先にまたがっていても、
 * 必要な祖先要素だけを残して正確にクローンしてくれる。
 */
export const collectHeadingSections = (wiki: HTMLElement): HeadingSection[] => {
  const headings = Array.from(wiki.querySelectorAll<HTMLElement>(HEADING_SELECTOR));

  return headings.map((heading, i) => {
    const level = Number(heading.tagName.slice(1));
    const nextHeading = headings[i + 1];

    const range = document.createRange();
    range.setStartAfter(heading);
    if (nextHeading) {
      range.setEndBefore(nextHeading);
    } else {
      range.setEnd(wiki, wiki.childNodes.length);
    }

    const container = document.createElement('div');
    container.appendChild(range.cloneContents());
    EXCLUDED_SELECTORS.forEach((selector) => {
      container.querySelectorAll(selector).forEach((el) => el.remove());
    });

    return { element: heading, level, ownText: extractTextWithBlockBreaks(container) };
  });
};

const pickMetricValue = (stats: PageStats, metric: HeadingCountMetric): number => {
  if (metric === 'chars') return stats.charsWithSpaces;
  if (metric === 'chars-no-space') return stats.charsNoSpaces;
  return stats.words;
};

const HEADING_METRIC_ICONS: Record<HeadingCountMetric, SvgShapeDef[]> = {
  chars: ICON_CHARS,
  'chars-no-space': ICON_CHARS_NO_SPACE,
  words: ICON_WORDS,
};

const buildHeadingBadge = (result: HeadingCountResult, metric: HeadingCountMetric): HTMLSpanElement => {
  const badge = document.createElement('span');
  badge.className = HEADING_BADGE_CLASS;
  badge.appendChild(createSvgIcon(HEADING_METRIC_ICONS[metric]));

  const text = document.createElement('span');
  text.className = 'gpwc-heading-badge-text';
  text.textContent = result.hasChildren
    ? `${result.ownCount.toLocaleString()}/${result.totalCount.toLocaleString()}`
    : result.ownCount.toLocaleString();
  badge.appendChild(text);

  return badge;
};

const cleanupHeadingBadges = (wiki: HTMLElement): void => {
  wiki.querySelectorAll(`.${HEADING_BADGE_CLASS}`).forEach((el) => el.remove());
};

const updateHeadingBadges = (wiki: HTMLElement): void => {
  cleanupHeadingBadges(wiki);

  const metric = findHeadingCountMetric(wiki);
  if (!metric) return;

  const sections = collectHeadingSections(wiki);
  const inputs: HeadingCountInput[] = sections.map((section) => ({
    level: section.level,
    ownCount: pickMetricValue(computeStats(section.ownText), metric),
  }));
  const results = aggregateHeadingCounts(inputs);

  sections.forEach((section, i) => {
    section.element.appendChild(buildHeadingBadge(results[i], metric));
  });
};

const cleanupAll = (): void => {
  document.querySelectorAll<HTMLElement>(`.${WIDGET_CLASS}`).forEach((widget) => {
    const parent = widget.parentElement;
    widget.remove();
    parent?.removeAttribute(ENHANCED_ATTR);
  });
  document.querySelectorAll(`.${HEADING_BADGE_CLASS}`).forEach((el) => el.remove());
  document.querySelectorAll(`.${HEADING_COUNT_HIDE_CLASS}`).forEach((el) => el.classList.remove(HEADING_COUNT_HIDE_CLASS));
};

// GROWI 側の想定外の DOM 構造（今後のバージョンアップ等）で getBodyText/computeStats/
// buildWidget のいずれかが例外を投げても、ページ全体やこのプラグインの以後の動作を
// 止めないよう try/catch で囲む。エラーはコンソールに残し、次回のスキャンで復旧を試みる。
const scanAndEnhance = (): void => {
  try {
    if (isHiddenContext()) {
      cleanupAll();
      return;
    }

    const wiki = getMainWiki();
    if (!wiki) return;

    if (wiki.hasAttribute(NO_COUNT_ATTR)) {
      if (wiki.hasAttribute(ENHANCED_ATTR)) cleanupWiki(wiki);
      cleanupHeadingBadges(wiki);
      return;
    }

    if (wiki.hasAttribute(ENHANCED_ATTR)) {
      updateWiki(wiki);
    } else {
      enhanceWiki(wiki);
    }

    updateHeadingBadges(wiki);
  } catch (error) {
    console.error(`${LOG_PREFIX} failed to update the word count widget`, error);
  }
};

const scheduleScan = (): void => {
  if (scanScheduled) return;
  scanScheduled = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scanScheduled = false;
      scanAndEnhance();
    });
  });
};

/** 自分自身が注入したウィジェット由来の mutation かどうか */
// 見出しバッジ（HEADING_BADGE_CLASS）も本文ウィジェットと同様に自分自身が注入する要素なので、
// ここに含めないと MutationObserver が「本文が変化した」と誤検知して再スキャン→バッジ再挿入→
// 再スキャン…と無限ループする。
const isSelfInjected = (node: Node): boolean =>
  node instanceof HTMLElement && (node.classList.contains(WIDGET_CLASS) || node.classList.contains(HEADING_BADGE_CLASS));

/** ノード自身が `.wiki` に一致するか、その子孫に `.wiki` を含むか */
const nodeIsOrContainsWiki = (node: Node): boolean => {
  if (!(node instanceof Element)) return false;
  return node.matches(WIKI_SELECTOR) || node.querySelector(WIKI_SELECTOR) !== null;
};

/**
 * `.wiki` と無関係な DOM 変更（ヘッダーの通知バッジ・サイドバー等）を無視するための判定。
 * 既存の `.wiki` の内部で起きた変更か、`.wiki` 自体が丸ごと追加/削除された変更のみ関心対象とする。
 */
const isWikiRelatedMutation = (mutation: MutationRecord, wiki: HTMLElement | null): boolean => {
  if (wiki && wiki.contains(mutation.target)) return true;
  return (
    Array.from(mutation.addedNodes).some(nodeIsOrContainsWiki) ||
    Array.from(mutation.removedNodes).some(nodeIsOrContainsWiki)
  );
};

const handleMutations = (mutations: MutationRecord[]): void => {
  const wiki = getMainWiki();
  let relevant = false;

  for (const mutation of mutations) {
    if (mutation.type === 'attributes') {
      // body の class 変化(編集モード遷移など)のみ関心対象
      if (mutation.target === document.body) {
        relevant = true;
        break;
      }
      continue;
    }

    if (!isWikiRelatedMutation(mutation, wiki)) continue;

    const hasRealAddition = Array.from(mutation.addedNodes).some((n) => !isSelfInjected(n));
    const hasRealRemoval = Array.from(mutation.removedNodes).some((n) => !isSelfInjected(n));
    if (hasRealAddition || hasRealRemoval) {
      relevant = true;
      break;
    }
  }

  if (!relevant) return;

  if (isHiddenContext()) {
    cleanupAll();
    return;
  }

  scheduleScan();
};

export const createWordCounter = (): { mount(): void; unmount(): void } => {
  const mount = (): void => {
    scanAndEnhance();

    observer = new MutationObserver(handleMutations);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    originalPushState = history.pushState.bind(history);
    originalReplaceState = history.replaceState.bind(history);

    history.pushState = function pushState(...args: Parameters<typeof history.pushState>) {
      const result = originalPushState!(...args);
      window.dispatchEvent(new Event(NAVIGATE_EVENT));
      return result;
    };
    history.replaceState = function replaceState(...args: Parameters<typeof history.replaceState>) {
      const result = originalReplaceState!(...args);
      window.dispatchEvent(new Event(NAVIGATE_EVENT));
      return result;
    };

    navigateHandler = () => scheduleScan();
    popstateHandler = () => scheduleScan();
    hashchangeHandler = () => scheduleScan();

    window.addEventListener(NAVIGATE_EVENT, navigateHandler);
    window.addEventListener('popstate', popstateHandler);
    window.addEventListener('hashchange', hashchangeHandler);
  };

  const unmount = (): void => {
    observer?.disconnect();
    observer = null;

    if (originalPushState) history.pushState = originalPushState;
    if (originalReplaceState) history.replaceState = originalReplaceState;
    originalPushState = null;
    originalReplaceState = null;

    if (navigateHandler) window.removeEventListener(NAVIGATE_EVENT, navigateHandler);
    if (popstateHandler) window.removeEventListener('popstate', popstateHandler);
    if (hashchangeHandler) window.removeEventListener('hashchange', hashchangeHandler);
    navigateHandler = null;
    popstateHandler = null;
    hashchangeHandler = null;

    cleanupAll();
  };

  return { mount, unmount };
};
