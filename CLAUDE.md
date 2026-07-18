# CLAUDE.md

## プロジェクト概要

- **名前**: `growi-plugin-word-counter`
- **種別**: GROWI Script プラグイン
- **目的**: GROWI ページ本文（閲覧モード）の先頭に文字数・単語数・読了時間などの統計情報を、背景・枠線のないミニマルなウィジェットで表示する

### 実装済み機能（フェーズ1）

| 機能 | 説明 |
|---|---|
| 文字数・単語数・読了時間表示 | ページ本文（`.wiki`）の先頭に `<div class="gpwc-widget">` を注入し、英語表記で `N chars / M chars (no spaces) / K words / ~T min read`（`toLocaleString()` で桁区切り）を表示。空白除く側は改行 `\n` も除去対象（`\s` にマッチするため） |
| ミニマルなウィジェット外観 | 背景色・枠線・角丸ボックスは持たず、下端に薄い罫線（`border-bottom`、`--gpwc-divider`）のみで本文と区切る。セグメント間の「/」区切り文字も廃止し、`gap` によるスペースのみで区切る（本文に自然に馴染むデザイン方針。ピル/カード等の主張が強いデザイン案は不採用） |
| SVG アイコン | 各指標（`.gpwc-seg`）の先頭に絵文字ではなく自己完結の SVG アイコンを配置。`currentColor` の円バッジ（`.gpwc-seg-icon-bg`、色は `--gpwc-icon-bg` で管理しテーマに関わらず固定）の上に、白抜きの図形（`stroke="white"` / `fill="white"`）を重ねるデザイン。`createSvgIcon`（`createElementNS` で `<svg>`/`<circle>`/`<g>`/`<text>`/`<line>`/`<rect>`/`<polyline>`/`<path>` を直接生成、`innerHTML` 不使用）が `SvgShapeDef[]`（`src/types.ts`）から組み立てる。文字数=太字の「A」、文字数(空白除く)=内向き矢印（圧縮）、単語数=吹き出し、読了時間=時計。単一の大きなモチーフで小サイズ表示でも判別しやすいデザインを採用（初期案の細線を複数組み合わせた抽象図形は視認性が低く不採用） |
| 統計計算の分離 | `computeStats(text)`（`src/stats.ts`）が文字数（空白含む/除く）・単語数・読了時間の全指標を常に計算。UI 側は `wordCounter.ts` 内の `SHOW_*` 定数フラグで表示項目を選択する |
| opt-out 属性 | `.wiki` 要素（またはその祖先経由で付与されたクラス）に `data-no-wordcount` があればウィジェット非表示 |
| 非表示条件 | 管理画面（`/admin`）・編集モード（`/edit`, `#edit`, `body.editing`, `body.grw-editor-mode`, `body.modal-open`）では非表示 |
| SPA 遷移 | `pushState` / `replaceState` モンキーパッチ + `popstate` + `hashchange` で再スキャン |
| 動的追加対応 | `MutationObserver` で本文の変化・再レンダリングを検知し再計算 |
| MutationObserver のスコープ限定 | `document.body` 全体を監視しているが、`isWikiRelatedMutation` で `.wiki` の内部で起きた変更、または `.wiki` 自体が丸ごと追加/削除された変更のみを再計算対象とする。ヘッダー通知バッジやサイドバー等 `.wiki` と無関係な DOM 変更では再計算・ウィジェット再構築が走らない |
| 自己参照除外 | ウィジェット自身の textContent（`📝 N字` 等）はカウント対象から除外（`getBodyText` が一時的に clone から除去して集計） |
| ブロック境界対応テキスト抽出 | `getBodyText` は素の `textContent` ではなく `extractTextWithBlockBreaks` を使う。`<h2>見出し</h2><p>本文</p>` のような隣接ブロック要素の間に区切り（`\n`）を挿入しながらテキストを収集するため、`words` 計算時に境界の単語が誤って結合されない。`BLOCK_TAGS` 定数（`p`/`div`/`li`/`h1`-`h6`/`table` 系/`br` 等）で対象タグを管理 |
| 改行の二重カウント防止 | GROWI がタグ間に整形用の改行テキストノードを出力するケース（例: `<blockquote>\n<p>a</p>\n</blockquote>`）では、その改行と `extractTextWithBlockBreaks` が挿入する区切りの `\n` が重なって連続してしまう。`extractTextWithBlockBreaks` は最後に `\s*\n\s*` を単一の `\n` へ正規化し、さらに先頭・末尾の空白を `trim()` することで、`空白含む` 文字数が改行の重複分だけ水増しされるのを防ぐ |
| 日本語対応の単語数カウント | `stats.ts` の `countWords` は `Intl.Segmenter`（`granularity: 'word'`）を使い、スペース区切りが無い日本語文でも意味のある単語単位に分割してカウントする（ライブラリ追加不要）。未対応の古い環境向けにスペース区切りへのフォールバックを用意 |
| コードブロック除外 | ` ``` ` で囲んだコードブロック（`<pre>` 要素、内部の `<code>` ごと）はカウント対象から除外。インラインコード（`` `code` ``）は除外しない。`EXCLUDED_SELECTORS` 配列で管理し、drawio・数式など追加除外対象を実機確認後に追加できる構造にしている |
| mermaid 図（副次的に除外済み） | ` ```mermaid ` ブロックは GROWI が `<pre><div><svg>...</svg></div></pre>` という構造でレンダリングし、ノードラベルのテキスト（`<span class="nodeLabel"><p>開始</p></span>` 等）を含む SVG 全体が `<pre>` の中に描画される。追加実装不要で `pre` 除外がそのまま効くため、drawio と同じ「図表は除外」方針を自動的に満たしている（実機 DOM で確認済み、`wordCounter.test.ts` にテストケースあり） |
| PlantUML 図（対応不要） | ` ```plantuml ` ブロックは `<div data-growi-is-content-rendering="false"><img src="https://www.plantuml.com/plantuml/svg/...">` という構造で、外部の PlantUML サーバーが生成した SVG 画像を `<img>` として埋め込む（`<pre>` には包まれない）。`<img>` は子ノードを持たない void 要素で `textContent` が常に空文字列になるため、ラベルテキストがそもそも DOM に存在せず追加のセレクタなしで安全（実機 DOM で確認済み、`wordCounter.test.ts` にテストケースあり） |
| drawio 除外 | `<div class="drawio-viewer">` 配下（図面 XML は `data-mxgraph` 属性値のため元々 `textContent` には含まれないが、SVG 内 `<foreignObject>` の図形ラベルは実テキストノードとしてカウントに混入するため）はカウント対象から除外。CSS Modules 由来のハッシュ付きクラス（`_drawio-viewer_xxxxx_N`）はバージョン間で変わるため使わず、素の `drawio-viewer` クラスで判定 |
| KaTeX 数式除外 | `<span class="katex">`（インライン）/ `<span class="katex-display"><span class="katex">`（ブロック）をカウント対象から除外。`.katex` 配下は `.katex-mathml`（隠し MathML 層。`<annotation>` に生 TeX ソースを保持）と `.katex-html`（実表示層）の2層構造で、素朴に textContent を取ると同じ数字・記号が二重にカウントされるため、`.katex` ごと除外して二重カウントと TeX ソース混入を同時に解消している |
| 見出しパーマリンク除外 | GROWI は見出し（h1-h6）の中に `<a class="revision-head-link">#</a>`（パーマリンクアンカー、テキストとして `#` を持つ）を挿入する。見出しごとに繰り返し出現するため `EXCLUDED_SELECTORS` で除外している |
| アイコンフォント除外 | `.material-symbols-outlined` は Material Symbols フォントのリガチャ表示用クラスで、見た目はアイコン1つでも DOM 上は `edit_square` 等の英単語が生テキストとして入っている。見出しの編集ボタン・表（Handsontable）の編集ボタンなど GROWI の各種編集 UI で繰り返し使われるため、個別のボタンクラスではなくこのアイコンフォントクラス自体を `EXCLUDED_SELECTORS` で一括除外している |
| 脚注 UI マーカー除外 | 本文中の脚注参照マーカー（`<sup><a data-footnote-ref>1</a></sup>`、テキストは連番の数字）と、脚注一覧末尾の戻りリンク（`<a data-footnote-backref>↩</a>`、テキストは矢印記号）を `[data-footnote-ref]` / `[data-footnote-backref]` 属性セレクタで除外。脚注そのものの内容テキスト（`<li>` 内の本文）は著者が書いた実コンテンツなので除外しない |
| deactivate | 全 listener 解除・MutationObserver.disconnect・モンキーパッチ復元・`.gpwc-widget` 削除・`data-gpwc-enhanced` 属性削除。本文 DOM は完全無変更で復元 |
| ダークモード | `@media (prefers-color-scheme: dark)` と `html[data-bs-theme="dark"]`（Bootstrap 5.3 GROWI UI トグル）の双方で CSS 変数を上書き |
| 印刷最適化 | `@media print` でウィジェット非表示 |

### 未実装（将来フェーズ）

- 選択範囲のみのカウント（現状は本文全体のみが対象）

**確認済み・対応不要と判断したもの:**

- **MathJax 対応は不要**: 実機で確認できた数式レンダリングは KaTeX（`.katex` クラス）のみで、`.katex` を `EXCLUDED_SELECTORS` に追加済み。複数のページ・複数の数式（分数、総和、行列等）で確認したが、いずれも `.katex` 構造で MathJax（`.MathJax` / `mjx-container` 等）は使われていなかった。この GROWI インスタンスでは MathJax 対応は不要と判断する
- **mermaid 図は追加対応不要**: `pre` 除外がそのまま効くため、drawio と同じ「図表は除外」方針を自動的に満たす（上記の機能表を参照）
- **PlantUML 図は追加対応不要**: `<img>` として画像化されるため textContent が空になる（上記の機能表を参照）
- **添付ファイルのプレビューは追加対応不要**: `<p><button aria-label="image.png"><img alt="image.png" src="/attachment/..."></button></p>` という構造で、ファイル名は `aria-label` / `alt` 属性としてのみ存在し実テキストノードが無い。`<img>` 自体も void 要素で textContent が空。属性はそもそも `textContent` に含まれないため（drawio の `data-mxgraph` と同様の理由）、追加のセレクタなしで安全（実機 DOM で確認済み、`wordCounter.test.ts` にテストケースあり）
- **PlantUML 図は追加対応不要**: `<div data-growi-is-content-rendering="false"><img src="https://www.plantuml.com/plantuml/svg/...">` という構造で、外部の PlantUML サーバーが生成した SVG 画像を `<img>` として埋め込んでいる（`<pre>` には包まれない）。`<img>` は子ノードを持たない void 要素で `textContent` が常に空文字列になるため、図中のラベルテキストはそもそも DOM 上に存在せず、追加のセレクタ無しで安全
- **複数 `.wiki` 問題は対応済み**: コメント本文も `<div class="page-comment-body"><div class="wiki comment">...` という構造で `.wiki` クラスを持つ（実機確認済み）ため、ページにコメントが付くと `.wiki` が複数ヒットする。`WIKI_SELECTOR` を `.wiki:not(.comment)` にすることで、DOM 順（本文とコメントの前後関係）に依存せず確実に本文側だけを選ぶようにした。`wordCounter.test.ts` に DOM 順を入れ替えたケースを含む回帰テストあり

## アーキテクチャ

このプラグインは Markdown レンダリングの拡張ではなく **DOM 直接操作** を行う。`customGenerateViewOptions` は使わず、`activate()` 内でページ本文（`.wiki`）をスキャンしてウィジェットを注入し、`MutationObserver` で動的な変化にも追従する。

**ブランチ運用方針**: 機能ごとに git ブランチを分けて実装・確認し、マージする。

### ファイル構成

```
growi-plugin-word-counter/
├── client-entry.tsx                # activate / deactivate + pluginActivators 登録
├── src/
│   ├── wordCounter.ts              # コア実装（スキャン・ウィジェット注入・SPA 遷移・クリーンアップ）
│   ├── wordCounter.test.ts         # wordCounter.ts の Vitest テスト
│   ├── stats.ts                    # computeStats(text) 純粋関数
│   ├── stats.test.ts               # stats.ts の Vitest テスト
│   ├── types.ts                    # 共有型定義（PageStats / SvgShapeDef / Window.pluginActivators）
│   └── styles/wordCounter.css      # ウィジェットスタイル・ダークモード・@media print
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts                  # build.manifest: 'manifest.json' を明示
├── vitest.config.ts                # environment: 'jsdom'
├── pnpm-lock.yaml
└── dist/                           # ビルド成果物（コミット必須）
    ├── manifest.json
    └── assets/
        ├── client-entry-*.js
        └── client-entry-*.css
```

### 主要な実装ポイント

**`createWordCounter()`** が公開 API で `{ mount, unmount }` を返す。

- **`scanAndEnhance()`**: `isHiddenContext()` が true なら全ウィジェットを `cleanupAll()` して終了。`getMainWiki()` で本文要素を取得し、`data-no-wordcount` があれば（付与済みなら）片付けて終了。`data-gpwc-enhanced` が未付与なら `enhanceWiki()`、付与済みなら `updateWiki()`（再計算のみ）。

- **`getMainWiki()`**: `document.querySelector(WIKI_SELECTOR)`（`WIKI_SELECTOR = '.wiki:not(.comment)'`）で本文要素を取得。コメント本文も `.wiki` クラスを持つ（`<div class="wiki comment">`）ため `:not(.comment)` で明示的に除外し、DOM 順に依存せず本文側だけを選ぶ。

- **`getBodyText(wiki)`**: `wiki.cloneNode(true)` した clone から、自身のウィジェット（`:scope > .gpwc-widget`）と `EXCLUDED_SELECTORS`（`pre` / `.drawio-viewer` / `.katex` / `.revision-head-link` / `.material-symbols-outlined` / `[data-footnote-ref]` / `[data-footnote-backref]`）に該当する要素を `remove()` してから `extractTextWithBlockBreaks(clone)` でテキストを収集する（元の DOM には触れない）。

- **`extractTextWithBlockBreaks(root)`**: `root.childNodes` を再帰的に walk し、テキストノードは `textContent` をそのまま集める。要素ノードは子を先に walk してから、`BLOCK_TAGS`（`p`/`div`/`li`/`h1`-`h6`/`table` 系/`br` 等）に該当するタグであれば末尾に `'\n'` を追加する。これにより `<h2>見出し</h2><p>本文</p>` のような隣接ブロック要素の境界にも区切りが入り、単純な `textContent` 結合で単語が誤って連結される問題を防ぐ。最後に `.replace(/\s*\n\s*/g, '\n').trim()` で、改行を含む空白の連続をブロック境界1つにつき改行1文字へ正規化し、先頭・末尾の余分な空白も除去する（GROWI 自身がタグ間に出力する整形用の改行と、ここで挿入した区切りの `\n` が重なって二重カウントされるのを防ぐため）。

- **`computeStats(text)`**（`src/stats.ts`）: `charsWithSpaces`（`Array.from(text).length` でサロゲートペア考慮）・`charsNoSpaces`（`\s` 除去後の長さ）・`words`（`countWords(text)`）・`readingMinutes`（`Math.max(1, Math.ceil(charsNoSpaces / 500))`、日本語想定で 1 分 500 文字）を返す純粋関数。UI 表示の有無に関わらず常に全項目を計算する。

- **`countWords(text)`**（`src/stats.ts`）: `Intl.Segmenter`（`granularity: 'word'`）が使える環境ではそれを使い、`isWordLike` な segment の数を数える。日本語のようにスペース区切りが無い言語でも意味のある単語単位で分割できる。未対応環境ではスペース区切り（`trim().split(/\s+/)`）にフォールバックする。

- **`buildWidget(stats)`**: `<div class="gpwc-widget">` を `createElement` + `textContent` + `setAttribute` のみで構築（`innerHTML` は使わない）。`role="status"` / `aria-label`（英語表記）を付与。`SHOW_*` フラグが true の指標のみ `createSegment(icon, text)` で `<span class="gpwc-seg">` として追加する。

- **`createSegment(icon, text)`**: `<span class="gpwc-seg">` の中に `createSvgIcon(icon)` の SVG と `<span class="gpwc-seg-text">` のラベルテキストを並べる。

- **`createSvgIcon(shapes)`**: `<svg viewBox="0 0 24 24">` の中に、まず `<circle class="gpwc-seg-icon-bg" r="11">`（円バッジ、塗りは CSS の `--gpwc-icon-bg` で管理）を配置し、続けて `<g transform="translate(12,12) scale(0.7) translate(-12,-12)" fill="none" stroke="white">` でアイコン本体を中心基準に縮小して重ねる（元の座標は 24x24 いっぱいを使う想定のため、円バッジ内に収まるよう縮小している）。`g` の子要素は `SvgShapeDef[]`（`{ tag, attrs, text? }` の配列）から `document.createElementNS` で直接生成する（`innerHTML` は使わない）。`text` が指定された要素（`<text>`）には `el.textContent = text` を設定する（アイコン定義は自前のハードコード文字列のみで外部/ユーザー入力を扱わないため安全）。文字数用（`ICON_CHARS`: `<text>` で太字の「A」1文字、`fill="white"` で明示的に白抜き指定）・文字数(空白除く)用（`ICON_CHARS_NO_SPACE`: `line` + `polyline` で内向き矢印2本＝圧縮イメージ、`g` の `stroke="white"` を継承）・単語数用（`ICON_WORDS`: `rect` + `path` で吹き出し）・読了時間用（`ICON_CLOCK`: `circle` + `line` で時計）の4種類を定義。細い線を複数組み合わせた抽象図形は 1em 前後の表示サイズでは視認性が低いため、単一の大きなモチーフで判別しやすくする方針にしている。

- **`enhanceWiki(wiki)`**: `computeStats(getBodyText(wiki))` → `buildWidget()` を `wiki.prepend()`、`data-gpwc-enhanced="1"` を設定。

- **`updateWiki(wiki)`**: 既存ウィジェットを新しいウィジェットで `replaceWith()`（DOM 再計算のたびに作り直す。差分更新はしない）。

- **`cleanupWiki(wiki)` / `cleanupAll()`**: ウィジェットを `remove()` し `data-gpwc-enhanced` を削除。`cleanupAll()` はページ上の全 `.gpwc-widget` を対象にする（`unmount()` と非表示コンテキスト遷移時の両方で使用）。

- **SPA 遷移検知**: `pushState` / `replaceState` にカスタムイベント `growi-pwc-navigate` をディスパッチするモンキーパッチ。`popstate` / `hashchange` も購読し、いずれも `scheduleScan()`（2 段 `requestAnimationFrame` で DOM 安定後に `scanAndEnhance()`）を呼ぶ。

- **MutationObserver**: `document.body` を `childList: true, subtree: true, attributes: true, attributeFilter: ['class']` で監視。`attributes` タイプの mutation は `target === document.body` の場合のみ関心対象とする（編集モード遷移など body クラス変化の検知）。`childList` タイプの mutation は `isWikiRelatedMutation(mutation, wiki)` で `.wiki` 内部の変更か `.wiki` 自体の追加/削除かを判定し、無関係なら（ヘッダー通知バッジ・サイドバー等）スキップする。関心対象と判定されたものについてさらに `isSelfInjected(node)`（`.gpwc-widget` クラス判定）で自己注入ノードのみの追加/削除を除外し、無限ループを防止。最終的に関心対象の mutation があれば `isHiddenContext()` を判定し、true なら `cleanupAll()`、false なら `scheduleScan()`。

- **`isWikiRelatedMutation(mutation, wiki)`**: `wiki.contains(mutation.target)` なら `.wiki` 内部の変更として true。それ以外は `mutation.addedNodes` / `removedNodes` に `.wiki` 自身またはその子孫を含む要素（`nodeIsOrContainsWiki`）があるかを見て、`.wiki` 自体が丸ごと追加/削除されたケース（例: SPA 遷移で GROWI が本文コンテナごと差し替える場合）も relevant と判定する。

- **`isHiddenContext()`**: `/admin` / `/admin/*` パス、`#edit` / `/edit` サフィックス、`body.editing` / `body.grw-editor-mode` / `body.modal-open` クラスのいずれかで true を返す。

### 命名規約

| 対象 | 値 |
|---|---|
| プレフィックス | `gpwc-*` |
| enhanced マーカー属性 | `data-gpwc-enhanced` |
| カスタムイベント名 | `growi-pwc-navigate` |
| CSS 変数 | `--gpwc-*` |
| opt-out（カウント非表示） | `data-no-wordcount` |
| ウィジェットクラス | `gpwc-widget` |
| ウィジェット内セグメントクラス | `gpwc-seg` |
| セグメント内 SVG アイコンクラス | `gpwc-seg-icon` |
| アイコンバッジ背景クラス | `gpwc-seg-icon-bg` |
| アイコンバッジ背景色変数 | `--gpwc-icon-bg`（テーマ非依存の固定値） |
| セグメント内ラベルテキストクラス | `gpwc-seg-text` |
| pluginActivators キー | `growi-plugin-word-counter` |

## ハマりどころ（必読・GROWI プラグイン共通）

### 1. `dist/` を git にコミットすること

GROWI はプラグインインストール時に **`pnpm install` も `pnpm build` も実行しない**。GitHub の archive zip を展開し、`dist/` 配下を Express で静的配信するだけ。

→ `.gitignore` に `dist/` を含めると GROWI 側で JS が読み込まれない。`dist/` は必ずコミットすること。

### 2. Vite のマニフェスト出力先

GROWI が読みに行く manifest のパスは以下の順で fallback:

1. `dist/.vite/manifest.json` (Vite 5 デフォルト)
2. `dist/manifest.json` (Vite 4 互換 / 明示設定時)

Vite 5+ では `vite.config.ts` で `build.manifest: 'manifest.json'` を明示してプロジェクト直下風のパスに出力するのが無難。

### 3. 再インストールが必要

コード更新を push しても、GROWI 管理画面で「有効/無効トグル」だけでは zip が取り直されない。確実に反映するには `/admin/plugins` で **削除 → 再インストール**。

### 4. `hashchange` 購読が必須

Edit → View 遷移で `location.hash` のみが変わる場合、`pushState` のモンキーパッチは発火しない。`hashchange` イベントの購読が必須。

### 5. MutationObserver の自己ループ防止

`wiki.prepend(widget)` が発火させる `childList` mutation で追加ノードとして widget div が検出される。`node.classList.contains('gpwc-widget')` でスキップすることで無限スキャンを防ぐ（`isSelfInjected`）。

### 6. ウィジェット自身の文字をカウントに混入させない

`.wiki` 配下に注入した `<div class="gpwc-widget">` は DOM 上 `.wiki` の子であるため、素朴に `wiki.textContent` を取ると自分自身の表示文字列（`1,234 chars` 等）が次回のカウントに混入し、再計算のたびに数値がずれていく。`getBodyText()` で clone してからウィジェットのみ除去して集計することでこれを防ぐ。

### 7. `<code>` 同様、既存 DOM 構造を破壊しない

本プラグインは `.wiki` 要素に `prepend()` でウィジェットを追加するのみで、本文の子要素構造自体は変更しない。`unmount()` 時にウィジェットと `data-gpwc-enhanced` を除去すれば元の DOM に完全復元される。

### 8. 見出し・表など GROWI の編集 UI が本文と無関係なテキストを混入させる

GROWI は見出し（h1-h6）タグの**内部**（子要素として）にパーマリンクアンカー（`.revision-head-link`、テキストは `#`）を挿入する。また見出しの編集ボタン（`.revision-head-edit-button`）や表（Handsontable）の編集ボタン（`.handsontable-modal-trigger`）など、複数の異なる UI 要素で共通して `.material-symbols-outlined`（Material Symbols フォントのリガチャ表示用クラス）が使われており、見た目はアイコン1つでも DOM 上は `edit_square` のような英単語がそのまま生テキストとして入っている。個別のボタンクラスを都度追いかけるより、**アイコンフォントのクラス自体を一括除外**する方が、今後 GROWI が同じパターンで追加する他の編集ボタンにも効く。ただし表本体を巻き込まないよう、除外対象は**アイコン span 自体**に限定し、テーブルなど周囲のラッパー要素ごと除外しないこと（実データが消えてしまう）。

同種の「アイコンフォントのリガチャテキスト」パターンが GROWI の他の UI 要素にもないか、実装追加時は注意すること。

### 9. SVG `<text>` の垂直中央揃えは `dominant-baseline` キーワードに頼らず座標計算で行う

`ICON_CHARS`（円バッジ内の「A」1文字）で `dominant-baseline: central` を使うと下寄りに、`middle` を使うと上寄りに表示された。`central`/`middle` はフォント・ブラウザ依存の基準線でブレやすく、単一文字を厳密に中央揃えしたい用途には不向きと判断した。

最終的に `dominant-baseline` は指定せず標準の alphabetic ベースラインのまま、`y` をキャップハイト分だけ中心からずらして計算する方式にした: `y = 中心の y座標 + font-size * 0.36`（キャップハイトは概ね font-size の 0.72 倍とされるため、その半分だけ中心から下げるとキャップハイトの中央が図形の中心に一致する）。このアイコンでは中心 `cy=12`・`font-size=18` なので `y = 12 + 18 * 0.36 ≈ 18.5` としている。他のフォントサイズ・中心座標でも同じ式で計算し直すこと。

### 10. `.wiki` クラスは本文以外（コメント本文）にも付く

GROWI はコメントの本文も `<div class="page-comment-body"><div class="wiki comment"><p>...</p></div></div>` という構造でレンダリングしており、**コメント本文も `.wiki` クラスを持つ**。`document.querySelector('.wiki')`（DOM 順で先頭 1 件）のような単純なセレクタだと、ページのレイアウトによってはコメント側を本文と誤認するリスクがある。

コメント側の `.wiki` には `comment` という追加クラスが付くため、`WIKI_SELECTOR` を `.wiki:not(.comment)` として明示的に除外し、DOM 順に依存しない実装にしている。他の副次的な `.wiki`（今後 GROWI が追加する可能性のある機能）が見つかった場合も、同様に追加クラスでの除外を検討すること。

## テスト

`pnpm test`（Vitest, `environment: 'jsdom'`）で `src/stats.test.ts` / `src/wordCounter.test.ts` を実行する。`pnpm test:watch` でウォッチモード。

**このテストスイートを作った経緯**: 実装初期は `stats.ts`/`extractTextWithBlockBreaks`/アイコン生成のロジックを都度 `.tmp-*.cjs` のような使い捨てスクリプトにコピー&ペーストして `jsdom` で手動検証していた。この方式は**実装本体と検証コードが別物になり、コピーが実装からズレても気づけない**という弱点があったため、Vitest で本体を直接 `import` する恒久的なテストに置き換えた。

- **`extractTextWithBlockBreaks` / `getBodyText` / `isHiddenContext`**（`src/wordCounter.ts`）: テストから直接 `import` するために `export` を付与している。`client-entry.tsx` は `createWordCounter` のみを使うため、この export はビルド成果物（`dist/`）のサイズ・内容に影響しない（Vite が未使用 export を tree-shake する）。
- **`wordCounter.test.ts`** には、この会話で実機の DOM から発見した回帰ケース（GROWI の見出しパーマリンク・見出し/表の編集ボタンのアイコンリガチャ・`<blockquote>\n<p>a</p>\n</blockquote>` の改行二重カウント等）をそのまま固定のテストケースとして含めている。今後 `EXCLUDED_SELECTORS` や `extractTextWithBlockBreaks` を変更する際は、まずこれらのテストを通すこと。
- **`createWordCounter()` の統合テスト**は同期的に検証できる範囲（初回 `mount()`・`data-no-wordcount`・非表示コンテキスト・`unmount()` の完全復元）のみをカバーしている。`pushState`/`hashchange` 経由の非同期再スキャン（`requestAnimationFrame` 2 段待ち）は今回のスコープでは未カバー（フェイクタイマー等の追加セットアップが必要なため）。

## デプロイ手順

```bash
pnpm build              # dist/ を更新
git add src/ dist/ ...  # 変更ファイルを staging
git commit -m "..."
git push
```

GROWI 管理画面 `/admin/plugins` で **削除 → 再インストール**。

## 動作確認チェックリスト

1. `pnpm test` が全て成功する
1a. `pnpm build` が成功し `dist/manifest.json` が出力される
2. GROWI で削除 → 再インストール後、DevTools Network で `client-entry-*.js` が 200 で取得される
3. 閲覧モードでページを開くと本文先頭に `N chars / M chars (no spaces) / K words / ~T min read` ウィジェットが表示される
4. 表示文字数がページ本文の実文字数と一致する（ウィジェット自身の文字は含まない）
4a. 各指標（chars / chars (no spaces) / words / min read）の先頭に、絵文字ではなく SVG アイコンが表示される（太字の「A」・内向き矢印・吹き出し・時計）。小サイズでも図形が判別できる
4b. 各アイコンが円形の塗りバッジ＋白抜き図形で表示される。ダークモードに切り替えても円バッジの色が変わらず、白い図形が引き続き視認できる（`--gpwc-icon-bg` がテーマ非依存のため）
5. `.wiki` に `data-no-wordcount` を付与するとウィジェットが表示されない
6. `/edit`・`#edit`・編集モードへ遷移するとウィジェットが消える（cleanupAll）
7. 編集モードから閲覧モードに戻るとウィジェットが再生成される
8. `/admin` 配下ではウィジェットが表示されない
9. SPA 遷移後の別ページでも本文先頭にウィジェットが表示され、文字数が新しいページの内容で計算される
10. 印刷プレビューでウィジェットが非表示になる
11. ダークモード切替（OS / GROWI UI トグル）でウィジェットの配色が追従する
12. プラグイン無効化（`unmount`）で全ページから `.gpwc-widget` と `data-gpwc-enhanced` が完全に消え、本文 DOM が元通りになる
13. 本文が空・非常に短い・非常に長いページでも数値が正しく計算される（0 文字、桁区切り表示含む）
14. 絵文字などサロゲートペアを含む本文でも文字数が直感的な値になる（`Array.from` によるカウント）

## 会話ガイドライン

- 常に日本語で会話する

## 作業ルール

- **git 操作は行わない**。`git add` / `git commit` / `git push` / `git restore` / `git checkout` などの git コマンドは一切実行しないこと。コミットやプッシュが必要な場面ではユーザーに依頼し、こちらでは行わない。
  - 変更内容のサマリだけ提示し、コミットメッセージ案を出す程度に留める。
  - 例外として `git status` / `git log` / `git diff` などの**読み取り専用**コマンドは状況把握のために実行してよい。
- **pnpm 操作は Claude が行う**。`pnpm install` / `pnpm approve-builds` / `pnpm build` / `pnpm test` / `pnpm audit` はこちらで実行する。

- **セキュリティチェックを必ず行う**。コード変更を完了したら、コミット候補としてユーザーに提示する前に以下を確認すること。問題が見つかった場合はその場で修正するか、ユーザーに明示的に報告する。
  - **機密情報の混入**: API キー / トークン / パスワード / 秘密鍵 / `.env` 系ファイルの値が、ソースコード・コメント・`dist/` 配下のビルド成果物に含まれていないか。
  - **XSS / 危険な HTML 挿入**: ユーザー入力を `dangerouslySetInnerHTML`・`innerHTML` で未エスケープで埋め込んでいないか。DOM 操作は `createElement` + `setAttribute` のみを使うこと。
  - **外部通信**: 外部 URL に対する `fetch` / `XMLHttpRequest` を新規追加していないか。
  - **依存パッケージの脆弱性**: 新規追加した npm パッケージは `pnpm audit` を実行して確認する。
  - **CSP / 外部リソース**: `<script>` / `<link>` を動的挿入して外部ドメインから読み込む実装になっていないか。自己完結なバンドルにすること。
