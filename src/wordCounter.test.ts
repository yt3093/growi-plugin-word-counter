import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWordCounter, extractTextWithBlockBreaks, getBodyText, isHiddenContext } from './wordCounter';

const setBody = (html: string): HTMLElement => {
  document.body.innerHTML = `<div class="wiki">${html}</div>`;
  return document.querySelector('.wiki') as HTMLElement;
};

describe('extractTextWithBlockBreaks', () => {
  it('separates adjacent block elements with no real whitespace between tags (compact HTML)', () => {
    const root = document.createElement('div');
    root.innerHTML = '<h2>Introduction</h2><p>This is next.</p>';
    expect(extractTextWithBlockBreaks(root)).toBe('Introduction\nThis is next.');
  });

  it('does not double-count separators when GROWI emits real whitespace text nodes between tags', () => {
    // 実機で報告された `<blockquote>\n<p>a</p>\n</blockquote>` の再現。
    const root = document.createElement('div');
    root.innerHTML = '<blockquote>\n<p>a</p>\n</blockquote>';
    expect(extractTextWithBlockBreaks(root)).toBe('a');
  });

  it('trims leading and trailing whitespace from the final result', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>a</p>';
    expect(extractTextWithBlockBreaks(root)).toBe('a');
  });

  it('does not insert a separator around inline elements (e.g. inline <code>)', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>before <code>x</code> after</p>';
    expect(extractTextWithBlockBreaks(root)).toBe('before x after');
  });
});

describe('getBodyText', () => {
  it('excludes fenced code blocks (<pre>) entirely', () => {
    const wiki = setBody('<p>keep</p><pre><code>should not be counted</code></pre>');
    expect(getBodyText(wiki)).toBe('keep');
  });

  it('excludes mermaid diagrams (rendered inside <pre>, so already covered by the pre exclusion)', () => {
    // 実機で報告された mermaid の出力構造の要点のみ再現: <pre><div><svg>...<span class="nodeLabel"><p>開始</p></span>...</svg></div></pre>
    const wiki = setBody(
      '<p>keep</p><pre><div data-growi-is-content-rendering="false"><svg><g><g class="node"><foreignObject><div><span class="nodeLabel"><p>開始</p></span></div></foreignObject></g><g class="node"><foreignObject><div><span class="nodeLabel"><p>条件</p></span></div></foreignObject></g></g></svg></div></pre>',
    );
    expect(getBodyText(wiki)).toBe('keep');
  });

  it('does not need any exclusion for attachment previews (filename lives only in aria-label/alt attributes)', () => {
    // 実機で報告された添付ファイルプレビューの DOM。ファイル名 "image.png" は
    // aria-label / alt 属性としてのみ存在し、実テキストノードはどこにも無い。
    const wiki = setBody(
      '<p>keep</p><p><button type="button" class="border-0 bg-transparent p-0" aria-label="image.png"><img alt="image.png" src="/attachment/xxxx"></button></p>',
    );
    expect(getBodyText(wiki)).toBe('keep');
  });

  it('does not need any exclusion for PlantUML diagrams (rendered as <img>, which has no text content)', () => {
    // 実機で報告された PlantUML の出力構造: <div data-growi-is-content-rendering="false"><img src="https://www.plantuml.com/..."></div>
    // <img> は子ノードを持たない void 要素なので textContent が常に空。図のラベルテキストは
    // DOM 上に存在せず、追加の EXCLUDED_SELECTORS が無くても混入しないことを確認する。
    const wiki = setBody(
      '<p>keep</p><div data-growi-is-content-rendering="false"><img src="https://www.plantuml.com/plantuml/svg/xxxx"></div>',
    );
    expect(getBodyText(wiki)).toBe('keep');
  });

  it('excludes drawio diagram viewers', () => {
    const wiki = setBody(
      '<p>keep</p><div class="drawio-viewer"><div><div class="mxgraph" data-mxgraph="xml"><svg><foreignObject><div>label</div></foreignObject></svg></div></div></div>',
    );
    expect(getBodyText(wiki)).toBe('keep');
  });

  it('excludes KaTeX-rendered math (both inline and block)', () => {
    const wiki = setBody(
      '<p>keep <span class="katex"><span class="katex-mathml">TeX source</span><span class="katex-html">1</span></span> more</p>',
    );
    expect(getBodyText(wiki)).toBe('keep  more');
  });

  it('excludes the GROWI heading permalink anchor ("#")', () => {
    const wiki = setBody(
      '<h1 id="1" class="revision-head"><a href="#1" class="revision-head-link">#</a>1</h1>',
    );
    expect(getBodyText(wiki)).toBe('1');
  });

  it('excludes footnote reference markers and backreference arrows, but keeps footnote content', () => {
    // 実機で報告された footnote の DOM（remark-footnotes 系のマークアップ）
    const wiki = setBody(
      '<p>これは脚注のテストです<sup><a id="fnref-1" href="#fn-1" data-footnote-ref="">1</a></sup>。複数の脚注も試します<sup><a id="fnref-2" href="#fn-2" data-footnote-ref="">2</a></sup>。</p>' +
        '<ol>' +
        '<li id="fn-1"><p>これが1つ目の脚注の内容です。 <a href="#fnref-1" class="data-footnote-backref" data-footnote-backref="">↩</a></p></li>' +
        '<li id="fn-2"><p>これが2つ目の脚注の内容です。 <a href="#fnref-2" class="data-footnote-backref" data-footnote-backref="">↩</a></p></li>' +
        '</ol>',
    );
    const text = getBodyText(wiki);
    expect(text).toContain('これは脚注のテストです。複数の脚注も試します。');
    expect(text).toContain('これが1つ目の脚注の内容です。');
    expect(text).toContain('これが2つ目の脚注の内容です。');
    expect(text).not.toContain('↩');
    // 参照マーカーの数字 "1" "2" が本文の数字と誤認されないことも確認
    expect(text).not.toMatch(/です1/);
    expect(text).not.toMatch(/です2/);
  });

  it('excludes Material Symbols icon ligature text wherever it appears (heading edit button)', () => {
    // 実機で報告された見出し編集ボタンの DOM
    const wiki = setBody(
      '<h1 id="1" class="revision-head"><a href="#1" class="revision-head-link">#</a>1<span class="revision-head-edit-button"><button type="button"><span class="material-symbols-outlined">edit_square</span></button></span></h1>',
    );
    expect(getBodyText(wiki)).toBe('1');
  });

  it('excludes Material Symbols icon ligature text wherever it appears (table edit button)', () => {
    // 実機で報告された表(Handsontable)編集ボタンの DOM。表の実データ(1/2/3/4)は残ること。
    const wiki = setBody(
      '<div class="editable-with-handsontable"><button type="button" class="handsontable-modal-trigger"><span class="material-symbols-outlined">edit_square</span></button><table><thead><tr><th>1</th><th>2</th></tr></thead><tbody><tr><td>3</td><td>4</td></tr></tbody></table></div>',
    );
    expect(getBodyText(wiki)).toBe('1\n2\n3\n4');
  });

  it('excludes its own previously-injected widget from the count', () => {
    const wiki = setBody('<p>real content</p>');
    const widget = document.createElement('div');
    widget.className = 'gpwc-widget';
    widget.textContent = '999 chars';
    wiki.prepend(widget);
    expect(getBodyText(wiki)).toBe('real content');
  });
});

describe('isHiddenContext', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    document.body.className = '';
  });

  it('is false on an ordinary view path', () => {
    expect(isHiddenContext()).toBe(false);
  });

  it('is true under /admin', () => {
    window.history.pushState({}, '', '/admin/plugins');
    expect(isHiddenContext()).toBe(true);
  });

  it('is true when the path ends with /edit', () => {
    window.history.pushState({}, '', '/some/page/edit');
    expect(isHiddenContext()).toBe(true);
  });

  it('is true when the hash is #edit', () => {
    window.history.pushState({}, '', '/some/page#edit');
    expect(isHiddenContext()).toBe(true);
  });

  it.each(['editing', 'grw-editor-mode', 'modal-open'])('is true when body has class "%s"', (cls) => {
    document.body.className = cls;
    expect(isHiddenContext()).toBe(true);
  });
});

describe('createWordCounter (integration)', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    document.body.className = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts a widget with the correct stats for the current page', () => {
    document.body.innerHTML = '<div class="wiki"><p>hello world</p></div>';
    const counter = createWordCounter();
    counter.mount();

    const widget = document.querySelector('.gpwc-widget');
    expect(widget).not.toBeNull();
    expect(widget?.textContent).toContain('11 chars');

    counter.unmount();
  });

  it('targets the main page body, not a comment (comments also render <div class="wiki comment">)', () => {
    // 実機で報告されたコメント欄の DOM 構造: <div class="page-comment-body"><div class="wiki comment">...
    document.body.innerHTML =
      '<div class="wiki"><p>main body content</p></div>' +
      '<div id="comments-container"><div class="page-comment-body"><div class="wiki comment"><p>test</p></div></div></div>';
    const counter = createWordCounter();
    counter.mount();

    const widget = document.querySelector('.gpwc-widget');
    expect(widget).not.toBeNull();
    // "main body content" (17 chars) であって、コメントの "test" (4 chars) ではないこと
    expect(widget?.textContent).toContain('17 chars');
    expect(document.querySelector('.wiki.comment .gpwc-widget')).toBeNull();

    counter.unmount();
  });

  it('still targets the main page body when the comment wiki appears earlier in DOM order', () => {
    // DOM 順に依存しない実装であることの確認（本文が後ろに来る非典型な並び）
    document.body.innerHTML =
      '<div id="comments-container"><div class="page-comment-body"><div class="wiki comment"><p>test</p></div></div></div>' +
      '<div class="wiki"><p>main body content</p></div>';
    const counter = createWordCounter();
    counter.mount();

    const widget = document.querySelector('.gpwc-widget');
    expect(widget).not.toBeNull();
    expect(widget?.textContent).toContain('17 chars');
    expect(document.querySelector('.wiki.comment .gpwc-widget')).toBeNull();

    counter.unmount();
  });

  it('does not mount a widget on a hidden-context path (e.g. /admin)', () => {
    window.history.pushState({}, '', '/admin/plugins');
    document.body.innerHTML = '<div class="wiki"><p>hello world</p></div>';
    const counter = createWordCounter();
    counter.mount();

    expect(document.querySelector('.gpwc-widget')).toBeNull();

    counter.unmount();
  });

  it('does not mount a widget when the wiki element has data-no-wordcount', () => {
    document.body.innerHTML = '<div class="wiki" data-no-wordcount><p>hello world</p></div>';
    const counter = createWordCounter();
    counter.mount();

    expect(document.querySelector('.gpwc-widget')).toBeNull();

    counter.unmount();
  });

  it('fully removes the widget and marker attribute on unmount, restoring the original DOM', () => {
    document.body.innerHTML = '<div class="wiki"><p>hello world</p></div>';
    const counter = createWordCounter();
    counter.mount();
    expect(document.querySelector('.gpwc-widget')).not.toBeNull();

    counter.unmount();

    expect(document.querySelector('.gpwc-widget')).toBeNull();
    const wiki = document.querySelector('.wiki');
    expect(wiki?.hasAttribute('data-gpwc-enhanced')).toBe(false);
    expect(wiki?.innerHTML).toBe('<p>hello world</p>');
  });

  it('does not throw and logs an error if something inside the scan pipeline fails unexpectedly', () => {
    document.body.innerHTML = '<div class="wiki"><p>hello world</p></div>';
    const wiki = document.querySelector('.wiki') as HTMLElement;
    const cloneNodeSpy = vi.spyOn(wiki, 'cloneNode').mockImplementation(() => {
      throw new Error('boom');
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const counter = createWordCounter();
    expect(() => counter.mount()).not.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('[growi-plugin-word-counter]');
    expect(document.querySelector('.gpwc-widget')).toBeNull();

    counter.unmount();
    cloneNodeSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
