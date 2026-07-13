import './styles/wordCounter.css';
import { computeStats } from './stats';
import type { PageStats } from './types';

const WIDGET_CLASS = 'gpwc-widget';
const ENHANCED_ATTR = 'data-gpwc-enhanced';
const NO_COUNT_ATTR = 'data-no-wordcount';
const NAVIGATE_EVENT = 'growi-pwc-navigate';

// GROWI はレンダリング済み本文を `.wiki` に描画する。
// コメント欄など副次的な `.wiki` が存在する場合、現状は先頭の1件のみを対象にしている。
// 実際の GROWI 環境で複数ヒットするようであればセレクタを絞り込む必要がある(要実機確認)。
const WIKI_SELECTOR = '.wiki';

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
const EXCLUDED_SELECTORS = ['pre', '.drawio-viewer', '.katex', '.revision-head-link', '.material-symbols-outlined'];

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

const isHiddenContext = (): boolean => {
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

const extractTextWithBlockBreaks = (root: HTMLElement): string => {
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
const getBodyText = (wiki: HTMLElement): string => {
  const clone = wiki.cloneNode(true) as HTMLElement;
  clone.querySelector(`:scope > .${WIDGET_CLASS}`)?.remove();
  EXCLUDED_SELECTORS.forEach((selector) => {
    clone.querySelectorAll(selector).forEach((el) => el.remove());
  });
  return extractTextWithBlockBreaks(clone);
};

const createSegment = (text: string): HTMLSpanElement => {
  const seg = document.createElement('span');
  seg.className = 'gpwc-seg';
  seg.textContent = text;
  return seg;
};

const buildWidget = (stats: PageStats): HTMLDivElement => {
  const widget = document.createElement('div');
  widget.className = WIDGET_CLASS;
  widget.setAttribute('role', 'status');
  widget.setAttribute('aria-label', `文字数 ${stats.charsWithSpaces.toLocaleString()}字`);

  const icon = document.createElement('span');
  icon.className = 'gpwc-icon';
  icon.textContent = '📝';
  icon.setAttribute('aria-hidden', 'true');
  widget.appendChild(icon);

  if (SHOW_CHARS_WITH_SPACES) {
    widget.appendChild(createSegment(`${stats.charsWithSpaces.toLocaleString()}字`));
  }
  if (SHOW_CHARS_NO_SPACES) {
    widget.appendChild(createSegment(`${stats.charsNoSpaces.toLocaleString()}字(空白除く)`));
  }
  if (SHOW_WORDS) {
    widget.appendChild(createSegment(`${stats.words.toLocaleString()}語`));
  }
  if (SHOW_READING_MINUTES) {
    widget.appendChild(createSegment(`約${stats.readingMinutes}分`));
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

const cleanupAll = (): void => {
  document.querySelectorAll<HTMLElement>(`.${WIDGET_CLASS}`).forEach((widget) => {
    const parent = widget.parentElement;
    widget.remove();
    parent?.removeAttribute(ENHANCED_ATTR);
  });
};

const scanAndEnhance = (): void => {
  if (isHiddenContext()) {
    cleanupAll();
    return;
  }

  const wiki = getMainWiki();
  if (!wiki) return;

  if (wiki.hasAttribute(NO_COUNT_ATTR)) {
    if (wiki.hasAttribute(ENHANCED_ATTR)) cleanupWiki(wiki);
    return;
  }

  if (wiki.hasAttribute(ENHANCED_ATTR)) {
    updateWiki(wiki);
  } else {
    enhanceWiki(wiki);
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
const isSelfInjected = (node: Node): boolean => node instanceof HTMLElement && node.classList.contains(WIDGET_CLASS);

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
