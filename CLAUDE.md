# CLAUDE.md

## プロジェクト概要

- **名前**: `growi-plugin-word-counter`
- **種別**: GROWI Script プラグイン
- **目的**: GROWI ページ本文（閲覧モード）の先頭に文字数・単語数・読了時間などの統計情報をバー状のウィジェットで表示する

### 実装済み機能（フェーズ1）

| 機能 | 説明 |
|---|---|
| 文字数・単語数・読了時間表示 | ページ本文（`.wiki`）の先頭に `<div class="gpwc-widget">` を注入し、英語表記で `N chars / M chars (no spaces) / K words / ~T min read`（`toLocaleString()` で桁区切り）を表示。空白除く側は改行 `\n` も除去対象（`\s` にマッチするため） |
| SVG アイコン | 各指標（`.gpwc-seg`）の先頭に絵文字ではなく自己完結の SVG アイコンを配置。`createSvgIcon`（`createElementNS` で `<svg>`/`<line>`/`<rect>`/`<circle>` を直接生成、`innerHTML` 不使用）が `SvgShapeDef[]`（`src/types.ts`）から組み立てる。`stroke="currentColor"` によりダークモード・印刷時の配色に自動追従。文字数=横線3本、文字数(空白除く)=ルーラー、単語数=角丸ブロック3つ、読了時間=時計 |
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
| drawio 除外 | `<div class="drawio-viewer">` 配下（図面 XML は `data-mxgraph` 属性値のため元々 `textContent` には含まれないが、SVG 内 `<foreignObject>` の図形ラベルは実テキストノードとしてカウントに混入するため）はカウント対象から除外。CSS Modules 由来のハッシュ付きクラス（`_drawio-viewer_xxxxx_N`）はバージョン間で変わるため使わず、素の `drawio-viewer` クラスで判定 |
| KaTeX 数式除外 | `<span class="katex">`（インライン）/ `<span class="katex-display"><span class="katex">`（ブロック）をカウント対象から除外。`.katex` 配下は `.katex-mathml`（隠し MathML 層。`<annotation>` に生 TeX ソースを保持）と `.katex-html`（実表示層）の2層構造で、素朴に textContent を取ると同じ数字・記号が二重にカウントされるため、`.katex` ごと除外して二重カウントと TeX ソース混入を同時に解消している |
| 見出しパーマリンク除外 | GROWI は見出し（h1-h6）の中に `<a class="revision-head-link">#</a>`（パーマリンクアンカー、テキストとして `#` を持つ）を挿入する。見出しごとに繰り返し出現するため `EXCLUDED_SELECTORS` で除外している |
| アイコンフォント除外 | `.material-symbols-outlined` は Material Symbols フォントのリガチャ表示用クラスで、見た目はアイコン1つでも DOM 上は `edit_square` 等の英単語が生テキストとして入っている。見出しの編集ボタン・表（Handsontable）の編集ボタンなど GROWI の各種編集 UI で繰り返し使われるため、個別のボタンクラスではなくこのアイコンフォントクラス自体を `EXCLUDED_SELECTORS` で一括除外している |
| deactivate | 全 listener 解除・MutationObserver.disconnect・モンキーパッチ復元・`.gpwc-widget` 削除・`data-gpwc-enhanced` 属性削除。本文 DOM は完全無変更で復元 |
| ダークモード | `@media (prefers-color-scheme: dark)` と `html[data-bs-theme="dark"]`（Bootstrap 5.3 GROWI UI トグル）の双方で CSS 変数を上書き |
| 印刷最適化 | `@media print` でウィジェット非表示 |

### 未実装（将来フェーズ）

- 複数 `.wiki` が存在するページ（コメント欄など）でのセレクタ絞り込み精査（要実機確認）
- 選択範囲のみのカウント（現状は本文全体のみが対象）
- **MathJax 対応**: 実機で確認できた数式レンダリングは KaTeX（`.katex` クラス）のみで、`.katex` を `EXCLUDED_SELECTORS` に追加済み。GROWI が MathJax レンダリングも使うページがあれば DOM 構造（`.MathJax` / `mjx-container` 等、未確認）を確認の上セレクタを追加する

## アーキテクチャ

このプラグインは Markdown レンダリングの拡張ではなく **DOM 直接操作** を行う。`customGenerateViewOptions` は使わず、`activate()` 内でページ本文（`.wiki`）をスキャンしてウィジェットを注入し、`MutationObserver` で動的な変化にも追従する。

**ブランチ運用方針**: 機能ごとに git ブランチを分けて実装・確認し、マージする。

### ファイル構成

```
growi-plugin-word-counter/
├── client-entry.tsx                # activate / deactivate + pluginActivators 登録
├── src/
│   ├── wordCounter.ts              # コア実装（スキャン・ウィジェット注入・SPA 遷移・クリーンアップ）
│   ├── stats.ts                    # computeStats(text) 純粋関数
│   ├── types.ts                    # 共有型定義（PageStats / Window.pluginActivators）
│   └── styles/wordCounter.css      # ウィジェットスタイル・ダークモード・@media print
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts                  # build.manifest: 'manifest.json' を明示
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

- **`getMainWiki()`**: `document.querySelector('.wiki')` で本文要素を取得。**現状は先頭 1 件のみを対象**にしており、コメント欄等で複数 `.wiki` がヒットするケースは未検証（要実機確認）。

- **`getBodyText(wiki)`**: `wiki.cloneNode(true)` した clone から、自身のウィジェット（`:scope > .gpwc-widget`）と `EXCLUDED_SELECTORS`（`pre` / `.drawio-viewer` / `.katex` / `.revision-head-link` / `.material-symbols-outlined`）に該当する要素を `remove()` してから `extractTextWithBlockBreaks(clone)` でテキストを収集する（元の DOM には触れない）。

- **`extractTextWithBlockBreaks(root)`**: `root.childNodes` を再帰的に walk し、テキストノードは `textContent` をそのまま集める。要素ノードは子を先に walk してから、`BLOCK_TAGS`（`p`/`div`/`li`/`h1`-`h6`/`table` 系/`br` 等）に該当するタグであれば末尾に `'\n'` を追加する。これにより `<h2>見出し</h2><p>本文</p>` のような隣接ブロック要素の境界にも区切りが入り、単純な `textContent` 結合で単語が誤って連結される問題を防ぐ。最後に `.replace(/\s*\n\s*/g, '\n').trim()` で、改行を含む空白の連続をブロック境界1つにつき改行1文字へ正規化し、先頭・末尾の余分な空白も除去する（GROWI 自身がタグ間に出力する整形用の改行と、ここで挿入した区切りの `\n` が重なって二重カウントされるのを防ぐため）。

- **`computeStats(text)`**（`src/stats.ts`）: `charsWithSpaces`（`Array.from(text).length` でサロゲートペア考慮）・`charsNoSpaces`（`\s` 除去後の長さ）・`words`（`countWords(text)`）・`readingMinutes`（`Math.max(1, Math.ceil(charsNoSpaces / 500))`、日本語想定で 1 分 500 文字）を返す純粋関数。UI 表示の有無に関わらず常に全項目を計算する。

- **`countWords(text)`**（`src/stats.ts`）: `Intl.Segmenter`（`granularity: 'word'`）が使える環境ではそれを使い、`isWordLike` な segment の数を数える。日本語のようにスペース区切りが無い言語でも意味のある単語単位で分割できる。未対応環境ではスペース区切り（`trim().split(/\s+/)`）にフォールバックする。

- **`buildWidget(stats)`**: `<div class="gpwc-widget">` を `createElement` + `textContent` + `setAttribute` のみで構築（`innerHTML` は使わない）。`role="status"` / `aria-label`（英語表記）を付与。`SHOW_*` フラグが true の指標のみ `createSegment(icon, text)` で `<span class="gpwc-seg">` として追加する。

- **`createSegment(icon, text)`**: `<span class="gpwc-seg">` の中に `createSvgIcon(icon)` の SVG と `<span class="gpwc-seg-text">` のラベルテキストを並べる。

- **`createSvgIcon(shapes)`**: `SvgShapeDef[]`（`{ tag, attrs }` の配列）から `document.createElementNS` で `<svg viewBox="0 0 24 24">` と子図形要素（`line`/`rect`/`circle` 等）を直接生成する（`innerHTML` は使わない）。`stroke="currentColor"` によりウィジェットのテキスト色（ダークモード・印刷スタイル含む）に自動追従する。文字数用（`ICON_CHARS`: 横線3本）・文字数(空白除く)用（`ICON_CHARS_NO_SPACE`: ルーラー）・単語数用（`ICON_WORDS`: 角丸ブロック3つ）・読了時間用（`ICON_CLOCK`: 時計）の4種類を定義。

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

## デプロイ手順

```bash
pnpm build              # dist/ を更新
git add src/ dist/ ...  # 変更ファイルを staging
git commit -m "..."
git push
```

GROWI 管理画面 `/admin/plugins` で **削除 → 再インストール**。

## 動作確認チェックリスト

1. `pnpm build` が成功し `dist/manifest.json` が出力される
2. GROWI で削除 → 再インストール後、DevTools Network で `client-entry-*.js` が 200 で取得される
3. 閲覧モードでページを開くと本文先頭に `N chars / M chars (no spaces) / K words / ~T min read` ウィジェットが表示される
4. 表示文字数がページ本文の実文字数と一致する（ウィジェット自身の文字は含まない）
4a. 各指標（chars / chars (no spaces) / words / min read）の先頭に、絵文字ではなく SVG アイコンが表示される（横線3本・ルーラー・角丸ブロック3つ・時計）
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
- **pnpm 操作は Claude が行う**。`pnpm install` / `pnpm approve-builds` / `pnpm build` / `pnpm audit` はこちらで実行する。

- **セキュリティチェックを必ず行う**。コード変更を完了したら、コミット候補としてユーザーに提示する前に以下を確認すること。問題が見つかった場合はその場で修正するか、ユーザーに明示的に報告する。
  - **機密情報の混入**: API キー / トークン / パスワード / 秘密鍵 / `.env` 系ファイルの値が、ソースコード・コメント・`dist/` 配下のビルド成果物に含まれていないか。
  - **XSS / 危険な HTML 挿入**: ユーザー入力を `dangerouslySetInnerHTML`・`innerHTML` で未エスケープで埋め込んでいないか。DOM 操作は `createElement` + `setAttribute` のみを使うこと。
  - **外部通信**: 外部 URL に対する `fetch` / `XMLHttpRequest` を新規追加していないか。
  - **依存パッケージの脆弱性**: 新規追加した npm パッケージは `pnpm audit` を実行して確認する。
  - **CSP / 外部リソース**: `<script>` / `<link>` を動的挿入して外部ドメインから読み込む実装になっていないか。自己完結なバンドルにすること。
