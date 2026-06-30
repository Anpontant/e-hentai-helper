# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

このファイルはリポジトリ内の AI エージェント向け指示の唯一の情報源である。
`CLAUDE.md` はこのファイルへの symlink。

## プロジェクト構成

Firefox MV3 拡張機能。ソースは `src/` に TypeScript / TSX で記述し、esbuild で
`addon/` にバンドルしてブラウザに読み込ませる。

```
src/
  background/        バックグラウンドスクリプト (.ts)
  content/           コンテンツスクリプト — モジュール + Preact コンポーネント (.ts/.tsx)
  popup/             ポップアップ UI — Preact エントリポイント (.ts)
  shared/            純粋なヘルパーと定数 (テストと共有)
  types/             型定義 (.d.ts)
addon/
  manifest.json      拡張機能マニフェスト (手動編集)
  background/        background.js (ビルド出力 — gitignored)
  content/           content.css (手動編集), content.js (ビルド出力 — gitignored)
  popup/             popup.html, popup.css (手動編集), popup.js (ビルド出力 — gitignored)
  icons/, _locales/
test/
  helpers/           テストヘルパー (browser-mock 等)
  *.test.ts          Vitest テストファイル
scripts/
  build.mjs          esbuild バンドラー設定
  bump-version.mjs   バージョン更新スクリプト
```

### 技術スタック

UI/状態管理に Preact + @preact/signals、バンドルに esbuild、テストに Vitest + happy-dom。
バージョン・ツール詳細は `package.json`。非自明な点だけ: `tsc` は型チェック専用 (`noEmit`)
でバンドルはしない (esbuild が担う)、JSX は automatic runtime (`jsxImportSource: 'preact'`)。

### 主要な規約

- ソースの編集は `src/` 内で行う。`addon/content/content.js`、
  `addon/popup/popup.js`、`addon/background/background.js` は
  ビルド出力なので直接編集しない (gitignored)。
- `addon/` 内の静的アセット (manifest.json, CSS, HTML, icons, \_locales) は
  手動編集する。

## アーキテクチャ

拡張機能は 3 つの独立したエントリポイントから成る:

### Background (`src/background/main.ts`)

exhentai.org → e-hentai.org のリダイレクト処理のみ。`webRequest.onBeforeRequest`
(blocking) で `igneous` cookie を確認し、cookie が無い・値が空・値が `'mystery'`
のいずれか (= 未ログイン) なら e-hentai.org にリダイレクトする。
`exhRedirect` 設定で有効/無効を切り替え、`storage.onChanged` でリアクティブに反映。

### Content Script (`src/content/main.tsx`)

e-hentai.org / exhentai.org のビューアーページ (`/s/` URL) に注入される。
主な機能:

- **画像フィット** (`fit.ts`): `<style>` 要素を注入して画像を viewport に合わせる
- **オートスクロール** (`scroll.ts`): ページ遷移後に画像位置へスクロール
- **プリロード** (`preloader.ts`): 次ページの HTML を fetch → 画像 URL を抽出 →
  `Image` で先読み。fetch 失敗時は hidden iframe にフォールバック
- **見開き表示** (`spread.ts`): 現在ページと隣ページの画像を並べてオーバーレイ表示。
  `pageUrlMap` / `pageImageMap` でページ番号と URL/画像 URL の対応を管理し、
  `sessionStorage` で永続化
- **ナビゲーション** (`navigation.ts`): ビューアー HTML のパース、ページ URL
  の解決、ギャラリーページからの URL 一括取得

**状態管理:** `state.ts` で Preact signals (`settings`, `menuOpen`,
`spreadState`, `virtualPage` 等) を定義。`main.tsx` 内の `effect()` で
設定変更に反応してフィット・プリロード・見開きを更新する。配管役として
`settings.ts` が `storage.local` ↔ `settings` signal の同期 (読込時に
`normalizeSettings` で正規化)、`status.ts` が `statusLines` signal 経由の
ステータス行表示を担う。

**UI:** `components/App.tsx` をルートとして Preact コンポーネントツリーを
`#eh-helper-root` に `render()` する。コンポーネントは signal の `.value` を
直接読んでリアクティブに更新される。

### Popup (`src/popup/main.ts`)

設定パネル。`browser.storage.local` に設定を保存し、
`browser.tabs.sendMessage` で content script に `reload-settings` を通知する。
Preact は使わず、素の DOM 操作で UI を構築。

### メッセージング規約

popup → content: `browser.tabs.sendMessage(tabId, { target: 'eh-helper-content', type: '...' })`
content 側は `browser.runtime.onMessage` でリスンし、`target` フィールドで
フィルタリングする。メッセージタイプ: `reload-settings`, `scroll-to-image`,
`toggle-fullscreen`。

### 共有コード (`src/shared/`)

`viewer-utils.ts`: URL パース・ページ番号抽出・見開き計算などの純粋関数。
`constants.ts`: デフォルト設定値とタイミング定数。
`types.ts`: `Settings`, `SpreadState` 等の型定義。
`components/`: content script とポップアップで共有する Preact コンポーネント。

### Preact JSX の注意点

- `className` ではなく `class` を使う (ESLint で `react/no-unknown-property`
  に `class` を許可済み)
- コンポーネントのインポートは `.jsx` 拡張子:
  `import { App } from './components/App.jsx'`

## 開発コマンド

`npm run dev` で build:watch + web-ext run を同時起動 (要 `.env` に AMO 設定)。
個別ビルドは `npm run build` / `npm run build:watch` (監視リビルド)。

### テスト

```bash
npm run test                              # 全テスト実行
npx vitest run test/viewer-utils.test.ts  # 単一テストファイル実行
npm run test:watch                        # ウォッチモード
```

テストは `test/helpers/browser-mock.ts` で `browser` グローバルをモック化する
(Vitest の `setupFiles` で自動読み込み)。

## 品質ゲート

コード・スクリプト・ツール・ドキュメントを変更したら、コミット前に必ず実行:

```bash
npm run check
```

`typecheck` → `lint` → `format:check` → `test` → `build` → `addon:lint` →
`addon:build` を順に実行する。すべて通らなければコミットしない。
CI (`.github/workflows/ci.yml`) でも PR とコード変更を含む main push 時に
同じコマンドが走る。

改行コードは `.gitattributes` で LF に統一されている。CRLF を混入させないこと。
触っていないファイルで `format:check` が失敗した場合は `npm run format` を実行。

## コミット規約

論理的な変更 (機能追加・修正・リファクタ等) ごとに独立したコミットを作り、ひとまとまりが
完了したら無関係な作業に移る前にコミットする。Conventional Commits 形式
(`feat:` / `fix:` / `perf:` / `docs:` / `chore:` / `refactor:` / `test:` / `ci:`) を使い、
メッセージは英語で簡潔に、何が変わったかを具体的に書く
(例: `fix: restore auto scroll during early page load`)。

## ブランチとレビューの流れ

`main` に直接コミットしない。トピックブランチで作業し、Pull Request を作成して
CI を通してからマージする。明示的に指示されない限り、無関係な変更はコミットしない。

## リリース

`npm run version:patch|minor|major` でバージョンを更新する。
バージョン変更を `main` に push すると
`.github/workflows/sign-addon.yml` により AMO 署名 + GitHub Release が作成される。

## Codex stop hook

`scripts/codex-hooks/check-on-stop.sh` は Codex の `Stop` 時、追跡ファイルに変更があれば
`npm run check` を自動実行する (`package.json` の `name` で識別し、このプロジェクトでのみ発火)。
`~/.codex/config.toml` に登録 (パス・形式は Codex のバージョン依存):

```toml
[hooks]
stop = ["sh", "scripts/codex-hooks/check-on-stop.sh"]
```

未登録ならコミット前に手動で `npm run check` を実行。
