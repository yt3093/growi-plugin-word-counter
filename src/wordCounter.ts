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

// UI に表示する指標のフラグ。stats.ts では常に全指標を計算しているため、
// 将来的に単語数・読了時間を表示する場合はここを true にするだけでよい。
const SHOW_CHARS_WITH_SPACES = true;
const SHOW_CHARS_NO_SPACES = false;
const SHOW_WORDS = false;
const SHOW_READING_MINUTES = false;

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

/**
 * 本文テキストを取得する。自分自身が注入したウィジェットの文字列は
 * カウントに混入しないよう、存在すれば除外する。
 */
const getBodyText = (wiki: HTMLElement): string => {
  const existingWidget = getExistingWidget(wiki);
  if (!existingWidget) return wiki.textContent ?? '';

  const clone = wiki.cloneNode(true) as HTMLElement;
  clone.querySelector(`:scope > .${WIDGET_CLASS}`)?.remove();
  return clone.textContent ?? '';
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

const handleMutations = (mutations: MutationRecord[]): void => {
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
