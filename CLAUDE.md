# CLAUDE.md

## プロジェクト概要

- **名前**: `growi-plugin-word-counter`
- **種別**: GROWI Script プラグイン
- **目的**: GROWI ページ本文（閲覧モード）の先頭に文字数・単語数・読了時間などの統計情報を、背景・枠線のないミニマルなウィジェットで表示する。加えて、オプトインのコードフェンスを埋め込むと見出し（h1〜h6）単位のカウントもインラインで表示できる

### 実装済み機能（フェーズ1: ページ全体ウィジェット）

| 機能 | 説明 |
|---|---|
| 文字数・単語数・読了時間表示 | ページ本文（`.wiki`）の先頭に `<div class="gpwc-widget">` を注入し、英語表記で `N chars / M chars (no spaces) / K words / ~T min read`（`toLocaleString()` で桁区切り）を表示。空白除く側は改行 `\n` も除去対象（`\s` にマッチするため） |
| ミニマルなウィジェット外観 | 背景色・枠線・角丸ボックスは持たず、下端に薄い罫線（`border-bottom`、`--gpwc-divider`）のみで本文と区切る。セグメント間の「/」区切り文字も廃止し、`gap` によるスペースのみで区切る（本文に自然に馴染むデザイン方針。ピル/カード等の主張が強いデザイン案は不採用） |
| SVG アイコン | 各指標（`.gpwc-seg`）の先頭に絵文字ではなく自己完結の SVG アイコンを配置。円バッジ（`.gpwc-seg-icon-bg`、色は `:root` スコープの `--gpwc-icon-bg` で管理。ライトモードは固定のスレートグレー、ダークモードでは暗い背景に埋もれないよう明るいトーンに切り替える）の上に、白抜きの図形（`stroke="white"` / `fill="white"`）を重ねるデザイン。`createSvgIcon`（`createElementNS` で `<svg>`/`<circle>`/`<g>`/`<text>`/`<line>`/`<rect>`/`<polyline>`/`<path>` を直接生成、`innerHTML` 不使用）が `SvgShapeDef[]`（`src/types.ts`）から組み立てる。文字数=太字の「A」、文字数(空白除く)=内向き矢印（圧縮）、単語数=吹き出し、読了時間=時計。単一の大きなモチーフで小サイズ表示でも判別しやすいデザインを採用（初期案の細線を複数組み合わせた抽象図形は視認性が低く不採用） |
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

### 実装済み機能（フェーズ2: 見出し単位カウント・オプトイン）

| 機能 | 説明 |
|---|---|
| オプトインの埋め込みタグ | ページ本文のどこかに ` ```gpwc-headings:chars ` のようなコードフェンスを1つ埋め込むと、そのページの全見出し（h1〜h6）にカウントバッジが表示される。値は `chars` / `chars-no-space` / `words` のいずれか1つを選択（`countWords` と同じロジックを使い分ける）。埋め込みが無いページでは何も表示されない（デフォルト無効）。マーカーのコードフェンス自体は `pre` 除外により本文カウントにも混入せず、見た目にも `.gpwc-heading-count-marker` クラスで非表示にする |
| GROWI コアのフェンス解析挙動（実機確認済み・注意） | `` ```gpwc-headings:chars `` は GROWI 本体の言語:ファイル名パーサーによって**コロンではなくハイフンの位置**で区切られ、`<code class="language-gpwc">` + `<cite class="code-highlighted-title">headings:chars</cite>` という構造になる（一般的な `言語:ファイル名` のコロン分割ではない、GROWI 固有の挙動）。`findHeadingCountConfig` は `code[class*="language-gpwc"]` を起点に検出し、`<cite>` のテキストを `"headings:" + 値` の形式としてパースする |
| 見出しレベルの絞り込み（表示のみ） | ` ```gpwc-headings:chars:h3 ` のように値に `:hN`（N=1〜6）を続けると、そのレベルより深い見出しはバッジを表示しない。省略時は h1〜h6 すべて表示。集計（`aggregateHeadingCounts`）自体は常に全見出しを対象にするため、非表示にした深い見出しの内容も上位見出しの合計には引き続き含まれる（表示のみを絞り込む設計） |
| 見出し単位の本文抽出 | `collectHeadingSections(wiki)` が `.wiki` 内の全見出し（`querySelectorAll`、ネスト深さ不問）を文書順に取得し、`Range` API で各見出しの「自身の内容」（その見出し直後から次の見出し直前まで。見出しタイトル自体は含まない）を切り出す。`<blockquote>` 内にネストされた見出し（CommonMark 上 `> # 見出し` は文法上有効）も見落とさない。`getBodyText` と同じ `EXCLUDED_SELECTORS` + `extractTextWithBlockBreaks` で抽出する |
| 無効な指標値への警告 | オプトインマーカーは見つかった（`"headings:"` 名前空間は一致）が値が `chars`/`chars-no-space`/`words` のいずれでもない場合、`console.warn('[growi-plugin-word-counter] invalid heading count metric ...')` を出す。マーカー自体が無い（機能オフ、正常な沈黙）場合との違いが分かるようにしている |
| 階層集計ロジック | `aggregateHeadingCounts`（`src/headingCounts.ts`、DOM 非依存の純粋関数）が見出しレベルに基づくスタック走査で親子関係を求め、文書順の逆順に集計することで多段ネストも正しく積み上げる。子を持つ見出しは「自身/配下すべて合計」、末端見出し（子なし）は自身のみを表示する。同階層の兄弟見出し同士は互いのカウントを含まない（共通の祖先にのみ加算） |
| 見出しバッジの表示 | 各見出し要素の末尾に `<span class="gpwc-heading-badge">` を追加。ページ全体ウィジェットと同じ `createSvgIcon` の白抜きバッジアイコン（`chars`=太字「A」、`chars-no-space`=内向き矢印、`words`=吹き出し）を指標に応じて使い回す。子を持つ見出しは `自身/合計`、末端見出しは `自身` のみを表示（分母なし） |
| 自己参照除外 | 見出しバッジ自身のテキスト（`"6/9"` 等）はページ全体ウィジェットのカウント・見出しごとのカウントいずれにも混入しないよう `EXCLUDED_SELECTORS` に `.gpwc-heading-badge` を追加している。また `isSelfInjected` にも `.gpwc-heading-badge` を追加し、バッジの挿入/再構築自体が MutationObserver の無限ループを起こさないようにしている |
| ライフサイクル統合 | `data-no-wordcount` によるオプトアウト・`isHiddenContext()` による非表示条件・`unmount()` による完全復元は、ページ全体ウィジェットと同じ条件で見出しバッジにも適用される（`cleanupHeadingBadges` / `cleanupAll` 内のバッジ・マーカー非表示クラスの除去） |

### 未実装（将来フェーズ）

- 選択範囲のみのカウント（現状は本文全体のみが対象）
- 見出しカウント機能: 複数指標の同時表示（現状は `chars`/`chars-no-space`/`words` から1つのみ選択）
- 見出しカウント機能: バッジのツールチップ/aria-label でカウントの意味を説明する

**確認済み・対応不要と判断したもの:**

- **MathJax 対応は不要**: 実機で確認できた数式レンダリングは KaTeX（`.katex` クラス）のみで、`.katex` を `EXCLUDED_SELECTORS` に追加済み。複数のページ・複数の数式（分数、総和、行列等）で確認したが、いずれも `.katex` 構造で MathJax（`.MathJax` / `mjx-container` 等）は使われていなかった。この GROWI インスタンスでは MathJax 対応は不要と判断する
- **mermaid 図は追加対応不要**: `pre` 除外がそのまま効くため、drawio と同じ「図表は除外」方針を自動的に満たす（上記の機能表を参照）
- **PlantUML 図は追加対応不要**: `<img>` として画像化されるため textContent が空になる（上記の機能表を参照）
- **添付ファイルのプレビューは追加対応不要**: `<p><button aria-label="image.png"><img alt="image.png" src="/attachment/..."></button></p>` という構造で、ファイル名は `aria-label` / `alt` 属性としてのみ存在し実テキストノードが無い。`<img>` 自体も void 要素で textContent が空。属性はそもそも `textContent` に含まれないため（drawio の `data-mxgraph` と同様の理由）、追加のセレクタなしで安全（実機 DOM で確認済み、`wordCounter.test.ts` にテストケースあり）
- **複数 `.wiki` 問題は対応済み**: コメント本文も `<div class="page-comment-body"><div class="wiki comment">...` という構造で `.wiki` クラスを持つ（実機確認済み）ため、ページにコメントが付くと `.wiki` が複数ヒットする。`WIKI_SELECTOR` を `.wiki:not(.comment)` にすることで、DOM 順（本文とコメントの前後関係）に依存せず確実に本文側だけを選ぶようにした。`wordCounter.test.ts` に DOM 順を入れ替えたケースを含む回帰テストあり
- **見出しカウント機能（フェーズ2）は実機で通し確認済み**: 実際の GROWI ページで ` ```gpwc-headings:chars-no-space ` を埋め込み、①見出しごとにバッジが正しく表示される、②集計値が実際の文章量と一致する、③マーカーのコードフェンス自体が表示されない、の3点を確認。実機 DOM でも `.gpwc-heading-badge` が見出し要素（パーマリンク・タイトル・編集ボタンの後ろ）に正しく挿入され、桁区切り表示（`1,000/1,010`）も含めて設計通りに動作することを確認した

## アーキテクチャ

このプラグインは Markdown レンダリングの拡張ではなく **DOM 直接操作** を行う。`customGenerateViewOptions` は使わず、`activate()` 内でページ本文（`.wiki`）をスキャンしてウィジェットを注入し、`MutationObserver` で動的な変化にも追従する。

**ブランチ運用方針**: 機能ごとに git ブランチを分けて実装・確認し、マージする。

### ファイル構成

```
growi-plugin-word-counter/
├── client-entry.tsx                # activate / deactivate + pluginActivators 登録
├── src/
│   ├── wordCounter.ts              # コア実装（スキャン・ウィジェット注入・見出しバッジ・SPA 遷移・クリーンアップ）
│   ├── wordCounter.test.ts         # wordCounter.ts の Vitest テスト
│   ├── stats.ts                    # computeStats(text) 純粋関数
│   ├── stats.test.ts               # stats.ts の Vitest テスト
│   ├── headingCounts.ts            # aggregateHeadingCounts(headings) 純粋関数（見出し階層集計）
│   ├── headingCounts.test.ts       # headingCounts.ts の Vitest テスト
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

- **`scanAndEnhance()`**: `isHiddenContext()` が true なら全ウィジェットを `cleanupAll()` して終了。`getMainWiki()` で本文要素を取得し、`data-no-wordcount` があれば（付与済みなら）片付けて終了。`data-gpwc-enhanced` が未付与なら `enhanceWiki()`、付与済みなら `updateWiki()`（再計算のみ）。本体全体を `try/catch` で囲んでおり、GROWI の想定外の DOM 構造等で `getBodyText`/`computeStats`/`buildWidget` のいずれかが例外を投げても `console.error('[growi-plugin-word-counter] ...')` に留めて処理を継続する（1回の失敗でプラグインの以後の動作が止まらないようにするため）。

- **`getMainWiki()`**: `document.querySelector(WIKI_SELECTOR)`（`WIKI_SELECTOR = '.wiki:not(.comment)'`）で本文要素を取得。コメント本文も `.wiki` クラスを持つ（`<div class="wiki comment">`）ため `:not(.comment)` で明示的に除外し、DOM 順に依存せず本文側だけを選ぶ。

- **`getBodyText(wiki)`**: `wiki.cloneNode(true)` した clone から、自身のウィジェット（`:scope > .gpwc-widget`）と `EXCLUDED_SELECTORS`（`pre` / `.drawio-viewer` / `.katex` / `.revision-head-link` / `.material-symbols-outlined` / `[data-footnote-ref]` / `[data-footnote-backref]` / `.gpwc-heading-badge`）に該当する要素を `remove()` してから `extractTextWithBlockBreaks(clone)` でテキストを収集する（元の DOM には触れない）。

- **`extractTextWithBlockBreaks(root)`**: `root.childNodes` を再帰的に walk し、テキストノードは `textContent` をそのまま集める。要素ノードは子を先に walk してから、`BLOCK_TAGS`（`p`/`div`/`li`/`h1`-`h6`/`table` 系/`br` 等）に該当するタグであれば末尾に `'\n'` を追加する。これにより `<h2>見出し</h2><p>本文</p>` のような隣接ブロック要素の境界にも区切りが入り、単純な `textContent` 結合で単語が誤って連結される問題を防ぐ。最後に `.replace(/\s*\n\s*/g, '\n').trim()` で、改行を含む空白の連続をブロック境界1つにつき改行1文字へ正規化し、先頭・末尾の余分な空白も除去する（GROWI 自身がタグ間に出力する整形用の改行と、ここで挿入した区切りの `\n` が重なって二重カウントされるのを防ぐため）。

- **`computeStats(text)`**（`src/stats.ts`）: `charsWithSpaces`（`Array.from(text).length` でサロゲートペア考慮）・`charsNoSpaces`（`\s` 除去後の長さ）・`words`（`countWords(text)`）・`readingMinutes`（`Math.max(1, Math.ceil(charsNoSpaces / 500))`、日本語想定で 1 分 500 文字）を返す純粋関数。UI 表示の有無に関わらず常に全項目を計算する。

- **`countWords(text)`**（`src/stats.ts`）: `Intl.Segmenter`（`granularity: 'word'`）が使える環境ではそれを使い、`isWordLike` な segment の数を数える。日本語のようにスペース区切りが無い言語でも意味のある単語単位で分割できる。未対応環境ではスペース区切り（`trim().split(/\s+/)`）にフォールバックする。

- **`buildWidget(stats)`**: `<div class="gpwc-widget">` を `createElement` + `textContent` + `setAttribute` のみで構築（`innerHTML` は使わない）。`role="status"` / `aria-label`（英語表記）を付与。`SHOW_*` フラグが true の指標のみ `createSegment(icon, text)` で `<span class="gpwc-seg">` として追加する。

- **`createSegment(icon, text)`**: `<span class="gpwc-seg">` の中に `createSvgIcon(icon)` の SVG と `<span class="gpwc-seg-text">` のラベルテキストを並べる。

- **`createSvgIcon(shapes)`**: `<svg viewBox="0 0 24 24">` の中に、まず `<circle class="gpwc-seg-icon-bg" r="11">`（円バッジ、塗りは CSS の `:root` スコープの `--gpwc-icon-bg` で管理。`.gpwc-widget`・`.gpwc-heading-badge` どちらの文脈でも参照できるよう、あえて要素スコープではなく `:root` に宣言している）を配置し、続けて `<g transform="translate(12,12) scale(0.7) translate(-12,-12)" fill="none" stroke="white">` でアイコン本体を中心基準に縮小して重ねる（元の座標は 24x24 いっぱいを使う想定のため、円バッジ内に収まるよう縮小している）。`g` の子要素は `SvgShapeDef[]`（`{ tag, attrs, text? }` の配列）から `document.createElementNS` で直接生成する（`innerHTML` は使わない）。`text` が指定された要素（`<text>`）には `el.textContent = text` を設定する（アイコン定義は自前のハードコード文字列のみで外部/ユーザー入力を扱わないため安全）。文字数用（`ICON_CHARS`: `<text>` で太字の「A」1文字、`fill="white"` で明示的に白抜き指定）・文字数(空白除く)用（`ICON_CHARS_NO_SPACE`: `line` + `polyline` で内向き矢印2本＝圧縮イメージ、`g` の `stroke="white"` を継承）・単語数用（`ICON_WORDS`: `rect` + `path` で吹き出し）・読了時間用（`ICON_CLOCK`: `circle` + `line` で時計）の4種類を定義。細い線を複数組み合わせた抽象図形は 1em 前後の表示サイズでは視認性が低いため、単一の大きなモチーフで判別しやすくする方針にしている。

- **`enhanceWiki(wiki)`**: `computeStats(getBodyText(wiki))` → `buildWidget()` を `wiki.prepend()`、`data-gpwc-enhanced="1"` を設定。

- **`updateWiki(wiki)`**: 既存ウィジェットを新しいウィジェットで `replaceWith()`（DOM 再計算のたびに作り直す。差分更新はしない）。

- **`cleanupWiki(wiki)` / `cleanupAll()`**: ウィジェットを `remove()` し `data-gpwc-enhanced` を削除。`cleanupAll()` はページ上の全 `.gpwc-widget` に加え、全 `.gpwc-heading-badge` と `.gpwc-heading-count-marker`（見出しカウントのオプトインマーカーの非表示クラス）も削除・解除する（`unmount()` と非表示コンテキスト遷移時の両方で使用）。

- **`findHeadingCountConfig(wiki)`**: 見出しカウント機能のオプトインマーカーを検出し `{ metric, maxLevel }` を返す。`code[class*="language-gpwc"]` を起点に、対応する `<pre>` に `gpwc-heading-count-marker` クラスを付与して非表示にし、`<cite class="code-highlighted-title">` のテキストを取得する。GROWI コアのフェンス解析は ` ```gpwc-headings:chars ` を**コロンではなくハイフンの位置**で区切るため、`<cite>` には `"headings:chars"` のように名前空間とコロンを含む文字列がまるごと入る（実機確認済み）。`"headings:"` プレフィックスを検証してから `citeText.split(':')` で `[指標, レベル指定?]` に分解する。指標が `chars` / `chars-no-space` / `words` のいずれでもなければ `console.warn` を出して無効として扱う（マーカー自体が無い場合は警告なしで静かに無効。「オフ」と「設定ミス」を区別するため）。レベル指定（`h1`〜`h6`）が付いていれば `maxLevel` に反映し、形式が不正なら同様に警告して無効化する。省略時は `DEFAULT_MAX_HEADING_LEVEL = 6`（全レベル表示）。

- **`collectHeadingSections(wiki)`**: `.wiki` 内の全見出し（`wiki.querySelectorAll('h1, h2, h3, h4, h5, h6')`、ネスト深さ不問）を文書順に取得し、各見出しについて `document.createRange()` で `setStartAfter(heading)` 〜 `setEndBefore(次の見出し)`（最後の見出しは `setEnd(wiki, wiki.childNodes.length)`）の範囲を `cloneContents()` で切り出す。`Range` は開始・終了点が異なる深さの祖先にまたがっていても正確に境界を処理してくれるため、`.wiki` 直下の子要素だけでなく `<blockquote>` 内などにネストされた見出し（CommonMark 上 `> # 見出し` は文法上有効）も見落とさない。切り出した内容には `getBodyText` と同じ `EXCLUDED_SELECTORS` + `extractTextWithBlockBreaks` を適用する。テスト用に `export` している。

- **`aggregateHeadingCounts(headings)`**（`src/headingCounts.ts`）: 見出しレベルの配列からスタックで親子関係を求め、文書順の逆順に集計することで「自身 + 配下すべて」を多段ネストでも正しく積み上げる純粋関数。同階層の兄弟見出しは互いのカウントを含まず、共通の祖先にのみ加算される。DOM に依存しないため `headingCounts.test.ts` で直接単体テストしている。

- **`buildHeadingBadge(result, metric)` / `updateHeadingBadges(wiki)` / `cleanupHeadingBadges(wiki)`**: 指標に応じたアイコン（`HEADING_METRIC_ICONS`、ページ全体ウィジェットと同じ `createSvgIcon`/`ICON_*` を再利用）と `自身/合計`（子を持つ場合）または `自身` のみ（末端の場合）のテキストからバッジを組み立てる。`updateHeadingBadges` は毎回 `cleanupHeadingBadges` で既存バッジを全削除してから作り直す（差分更新はしない。増減した見出しにも追従するため）。

- **SPA 遷移検知**: `pushState` / `replaceState` にカスタムイベント `growi-pwc-navigate` をディスパッチするモンキーパッチ。`popstate` / `hashchange` も購読し、いずれも `scheduleScan()`（2 段 `requestAnimationFrame` で DOM 安定後に `scanAndEnhance()`）を呼ぶ。

- **MutationObserver**: `document.body` を `childList: true, subtree: true, attributes: true, attributeFilter: ['class']` で監視。`attributes` タイプの mutation は `target === document.body` の場合のみ関心対象とする（編集モード遷移など body クラス変化の検知）。`childList` タイプの mutation は `isWikiRelatedMutation(mutation, wiki)` で `.wiki` 内部の変更か `.wiki` 自体の追加/削除かを判定し、無関係なら（ヘッダー通知バッジ・サイドバー等）スキップする。関心対象と判定されたものについてさらに `isSelfInjected(node)`（`.gpwc-widget` / `.gpwc-heading-badge` クラス判定）で自己注入ノードのみの追加/削除を除外し、無限ループを防止。最終的に関心対象の mutation があれば `isHiddenContext()` を判定し、true なら `cleanupAll()`、false なら `scheduleScan()`。

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
| アイコンバッジ背景色変数 | `--gpwc-icon-bg`（`:root` スコープ。ライトモードは固定値、ダークモードでは明るいトーンに上書き） |
| セグメント内ラベルテキストクラス | `gpwc-seg-text` |
| pluginActivators キー | `growi-plugin-word-counter` |
| コンソールログ prefix | `[growi-plugin-word-counter]`（`LOG_PREFIX`） |
| 見出しカウントのオプトインタグ | ` ```gpwc-headings:値[:hN] `（値は `chars` / `chars-no-space` / `words`。`:hN`（N=1〜6）は省略可で、指定時はそのレベルより深い見出しのバッジ表示を抑制） |
| 見出しバッジクラス | `gpwc-heading-badge` |
| 見出しバッジ内テキストクラス | `gpwc-heading-badge-text` |
| 見出しカウントマーカー非表示クラス | `gpwc-heading-count-marker` |

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

`wiki.prepend(widget)` が発火させる `childList` mutation で追加ノードとして widget div が検出される。`isSelfInjected` で `.gpwc-widget` をスキップすることで無限スキャンを防ぐ。見出しバッジ（`.gpwc-heading-badge`）を追加した際も同様に `isSelfInjected` へ追加し忘れると、バッジ挿入のたびに再スキャン→バッジ再構築→再スキャン…の無限ループになる（自前で注入する要素を増やすたびに、この関数へ追加するのを忘れないこと）。

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

### 11. GROWI コアのコードフェンス「言語:ファイル名」解析はコロンではなくハイフンで区切られることがある

姉妹プロジェクト `growi-plugin-codeblock-extended` の調査では「GROWI のコードフェンスパーサーは `:` をセパレータとして `言語:ファイル名` を処理する」と記録されていたが、これはあくまで**言語部分が実在の言語として認識できる場合の挙動**だった可能性が高い。

本プロジェクトで見出しカウント機能のオプトインマーカーとして ` ```gpwc-headings:chars ` というフェンスを実機で試したところ、`gpwc-headings` という（実在しない）言語名は**ハイフンの位置で区切られ**、`<code class="language-gpwc">` となった。一方コロン以降を含む残り全体（`headings:chars`）は分割されずに `<cite class="code-highlighted-title">headings:chars</cite>` へまるごと出力された。

この挙動を逆手に取り、`code[class*="language-gpwc"]` を検出の起点にし、`<cite>` のテキストを `"名前空間:値"` として自前でパースする実装にしている（`findHeadingCountConfig`）。**GROWI 本体のフェンス解析はコロン区切りだけでなくハイフンの影響も受ける**ことが実機で確認できたため、同様に `言語:ファイル名` 記法を利用した新機能を追加する際は、想定通りの区切り方になるか改めて実機確認すること。

### 12. 「動作しない」の原因が、コード側ではなく GROWI 管理画面のブランチ指定違いだったケース

見出しカウント機能の開発中、新しいコミットを push しても GROWI 上の挙動が一切変わらない（新しく追加した `console.warn` すら出ない）という報告があった。`git log` でローカル・リモートとも最新コミットが反映されていることを確認できたため、コード側の push 漏れは否定できた。

原因は **GROWI 管理画面 `/admin/plugins` のプラグインインストール元が、作業中のブランチ（`feature/heading-word-count`）ではなく `main` 等の別ブランチを指しっぱなしになっていた**ことだった。ブランチ運用方針（本ファイル冒頭）で「機能ごとに git ブランチを分ける」としているため、機能ブランチで作業中は GROWI 側のインストール元も明示的にそのブランチへ切り替えておく必要がある。

**切り分けの手順（今後同様の報告があれば）**:
1. まず `git log`（ローカル・`origin/<branch>` 双方）で最新コミットが反映されているか確認する（読み取り専用コマンドなので実行してよい）
2. 反映されているのに挙動が変わらない場合は、コンソールに `console.warn`/`console.error` で意図的に既知のログを出させて（例: わざと無効な値を指定する）、**そのビルドが実際にデプロイされているか**を確認する
3. それでも変化が無ければ、GROWI 側のプラグイン設定（参照ブランチ・URL）を疑う

なお `<cite>` の残り文字列（`"headings:chars"` 等）自体はハイフン分割の対象にならず丸ごと保持されることも実機確認済みなので、その中でさらに `:` 区切りの複数フィールド（例: `chars:h3` の指標+レベル指定）を自前でパースする分には問題なく動作する。

### 13. CSS カスタムプロパティを複数の注入先で共有する場合は `:root` スコープで宣言する

`--gpwc-icon-bg`（アイコンバッジの背景色）は当初 `.gpwc-widget` セレクタ内で宣言していた。`.gpwc-widget` は `.wiki` に `prepend()` される要素だが、見出しバッジ（`.gpwc-heading-badge`）は見出しタグ（`<h1>` 等）の子要素として挿入されるため、DOM 上 `.gpwc-widget` の子孫ではない。CSS カスタムプロパティは通常の CSS プロパティと同様に**祖先からの継承でしか伝播しない**ため、`.gpwc-heading-badge` 側では `--gpwc-icon-bg` が未定義になり、`var(--gpwc-icon-bg, フォールバック値)` のフォールバックに頼っていた（ダークモードの上書きにも追従しなかった）。

ダークモードでアイコンの視認性を上げる対応をした際、見出しバッジにも同じ改善を反映する必要が生じたため、`--gpwc-icon-bg` の宣言場所を `.gpwc-widget` から `:root` に移動した。`:root`（＝ `<html>` 要素）はページ上のどの要素からも祖先になるため、`.gpwc-widget` と `.gpwc-heading-badge` の両方から同じ変数を参照でき、`html[data-bs-theme='dark']` や `@media (prefers-color-scheme: dark) { :root { ... } }` での上書きも両方に一括で効くようになった。フォールバック値（`var(--x, fallback)`）は「変数がどこにも定義されていない場合の保険」であり、「別の DOM 位置にいる要素にも値を届ける手段」としては使えないことに注意。**複数の自己注入要素（`.gpwc-widget` と `.gpwc-heading-badge` のように、DOM 上バラバラの場所に挿入される要素）でテーマ関連の値を共有したい場合は、宣言スコープを見直すこと。**

## テスト

`pnpm test`（Vitest, `environment: 'jsdom'`）で `src/stats.test.ts` / `src/wordCounter.test.ts` / `src/headingCounts.test.ts` を実行する。`pnpm test:watch` でウォッチモード。

**このテストスイートを作った経緯**: 実装初期は `stats.ts`/`extractTextWithBlockBreaks`/アイコン生成のロジックを都度 `.tmp-*.cjs` のような使い捨てスクリプトにコピー&ペーストして `jsdom` で手動検証していた。この方式は**実装本体と検証コードが別物になり、コピーが実装からズレても気づけない**という弱点があったため、Vitest で本体を直接 `import` する恒久的なテストに置き換えた。

- **`extractTextWithBlockBreaks` / `getBodyText` / `isHiddenContext` / `collectHeadingSections`**（`src/wordCounter.ts`）: テストから直接 `import` するために `export` を付与している。`client-entry.tsx` は `createWordCounter` のみを使うため、この export はビルド成果物（`dist/`）のサイズ・内容に影響しない（Vite が未使用 export を tree-shake する）。
- **`wordCounter.test.ts`** には、この会話で実機の DOM から発見した回帰ケース（GROWI の見出しパーマリンク・見出し/表の編集ボタンのアイコンリガチャ・`<blockquote>\n<p>a</p>\n</blockquote>` の改行二重カウント等）をそのまま固定のテストケースとして含めている。今後 `EXCLUDED_SELECTORS` や `extractTextWithBlockBreaks` を変更する際は、まずこれらのテストを通すこと。
- **`createWordCounter()` の統合テスト**は同期的に検証できる範囲（初回 `mount()`・`data-no-wordcount`・非表示コンテキスト・`unmount()` の完全復元）のみをカバーしている。`pushState`/`hashchange` 経由の非同期再スキャン（`requestAnimationFrame` 2 段待ち）は今回のスコープでは未カバー（フェイクタイマー等の追加セットアップが必要なため）。
- **`headingCounts.test.ts`** はユーザー提示の2つの検証例（`h1:5/h2:6/h3:3` → `5/14, 6/9, 3` と、兄弟見出し `h1:5/h2①:3/h2②:2` → `5/10, 3, 2`）をそのままテストケース化している。`aggregateHeadingCounts` は DOM に依存しない純粋関数なので、見出しレベルの組み合わせパターン（レベルの飛び・複数の最上位見出し・深いネスト等）を直接・高速に検証できる。
- **テストの落とし穴（この会話で実際に踏んだもの）**: 統合テストの `it()` 内で `expect` が失敗すると、その行より後ろの `counter.unmount()` に到達できず、`history.pushState` の監視パッチが元に戻らないまま次のテストに進んでしまう。`createWordCounter()` は `originalPushState` 等をモジュールスコープの共有状態として持つ設計のため、後続のテストで無関係な `TypeError: originalPushState is not a function` が連鎖的に発生する（実際に発生した）。統合テストを書く際は `mount()`/`unmount()` の対応漏れがないか、アサーションの正しさを先に確認すること。

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
4b. 各アイコンが円形の塗りバッジ＋白抜き図形で表示される。ダークモードに切り替えると円バッジがより明るいトーンになり、暗い背景でも円の輪郭・白い図形がはっきり視認できる（`--gpwc-icon-bg` のダークモード上書きにより、ライトモード時の色そのままだと暗い背景に埋もれてしまう問題を回避している）
4c. 見出しカウント機能を有効にしたページで、見出しバッジのアイコンもダークモードで同様に明るいトーンへ切り替わる（`.gpwc-widget` と `.gpwc-heading-badge` は `:root` スコープの `--gpwc-icon-bg` を共有しているため）
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
15. コメントが付いているページでもウィジェットが正しく本文側に表示される（コメント本文の文字数を誤って拾わない）
16. 脚注（footnote）があるページで、参照マーカーの数字・脚注一覧末尾の「↩」がカウントに含まれず、脚注の内容テキストはカウントに含まれる
17. mermaid・PlantUML 図・drawio 図があるページで、図中のラベルテキストがカウントに混入しない
18. 添付ファイル（画像等）のプレビューがあるページで、ファイル名がカウントに混入しない
19. ` ```gpwc-headings:chars ` を埋め込んでいないページでは見出しバッジが表示されない（デフォルト無効）
20. ` ```gpwc-headings:chars ` を埋め込んだページで、全見出し（h1〜h6）の隣にバッジが表示される
21. マーカーのコードフェンス自体が見た目に表示されない（`.gpwc-heading-count-marker` で非表示）
22. 子見出しを持つ見出しは `自身/合計`（例: `6/9`）、末端見出しは `自身` のみ（分母なし）で表示される
23. 兄弟見出し（同階層で複数ある場合）は互いのカウントを含まず、共通の祖先にのみ加算される
24. `chars` / `chars-no-space` / `words` それぞれの値でマーカーを埋め込み、対応する指標・アイコンで表示される
25. 見出しバッジのテキスト自体が、ページ全体ウィジェットのカウント・他の見出しの自身カウントいずれにも混入しない
26. `.wiki` に `data-no-wordcount` を付与すると見出しバッジも表示されない
27. プラグイン無効化（`unmount`）で見出しバッジとマーカーの非表示クラスが完全に消え、本文 DOM が元通りになる
28. ` ```gpwc-headings:chars:h2 ` のようにレベル指定を付けると、h3 以降の見出しにバッジが表示されない
29. レベル指定で非表示にした深い見出しの内容も、表示されている上位見出しの合計（分母側）には引き続き含まれる
30. 存在しないレベル（例: `chars:h9`）や不正な形式を指定すると `console.warn` が出て機能全体が無効になる（バッジが1つも出ない）

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
