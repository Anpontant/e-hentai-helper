# オーバーレイ時の並列先読み（preload 逐次チェーンの置き換え）

- 日付: 2026-06-30
- 種別: 性能改善 + リファクタ（patch リリース）
- 対象: オーバーレイ表示（`overlayView` / `spreadView`）時のみ

## 背景・目的

現状のオーバーレイ表示では、先読みが `preloadAheadFrom`（`src/content/preloader.ts:194`）の
**逐次チェーン**で行われている。各深さ（depth）は、前の深さで取得した
ビューア HTML から `followingUrl` を解析して初めて次の depth を起動するため、
`depth=1 の fetch+画像DL → depth=2 の fetch+画像DL → …` と直列に伸びる。

しかしオーバーレイ時は、進行方向のビューア URL が `pageUrlMap` にすでに揃っている
ことが多い（現ページ描画時に `resolvePageImage` →`fetchGalleryPageUrls` が一覧1ページ
分＝約40件の URL をまとめて取得済みのため）。URL が分かっているなら、先のページを
`followingUrl` 待ちで直列に辿る必要はなく、**ページ番号ベースで N ページ分を並列に
先読み**できる。

目的: **オーバーレイ時の先読みを逐次チェーンからページ番号ベースの並列先読みに
置き換え**、「次へ」進行時のカクつきを減らす。あわせて、先読み周りに散在する重複
ロジックを整理する。

## 確定した設計判断

- **スコープはオーバーレイ時のみ**。通常モード（非オーバーレイ）の先読みは
  従来どおり `preloadAheadFrom` の逐次チェーンを維持する。
- 並列窓のサイズ N = `preloadAheadCount`（0〜5 にクランプ、`popup/main.ts:104`）。
  窓は**ページ単位**で数える（見開きでも次の N **ページ**。N=5 で約2〜3見開き先）。
- **キャッシュ済みはスキップ**: 画像バイト取得済みのページは再フェッチしない。
  窓 ≤ 5 かつスキップありのため、同時フェッチは最大5本・実際はそれ未満。別途の
  同時実行上限（K）は設けない。
- **iframe フォールバック（`preloadByHiddenFrame`）を廃止する**。これは*次 URL の
  取得*用であって画像バイトは取らず、マップ＋ギャラリー一覧フォールバックが整った
  現状では役割を終えている。フェッチ失敗時は `preloadState` を `failed` にし、既存の
  retry UI（`spread.ts:retryImage`）と実遷移時の通常ロードに委ねる。
- 重複する「ビューア doc を fetch → 画像 URL・次 URL を抽出 → マップ更新 → persist」
  処理を共通ヘルパー `resolvePageData(url)` に集約する（今回触れる3か所を 1 本化）。
- 中断制御（`preloadRunId` / `preloadAbortController`）は現行どおり維持する。

## アーキテクチャ

### 純粋関数（`src/shared/viewer-utils.ts`、テスト対象）

```
getPreloadWindowPages(currentPage, pagesInSpread, total, count): number[]
```

- 窓の開始ページ `start = currentPage + pagesInSpread`（現在の見開き／ページの「次」）。
- `start` から最大 `count` ページを並べる。`p < 1` は除外、`total > 0 && p > total` で打ち切り。
- 例: `currentPage=3, pagesInSpread=2, total=20, count=5` → `[5,6,7,8,9]`。
  末尾付近 `currentPage=19, pagesInSpread=2, total=20, count=5` → `[]`（21 以降は無し）。
  `count=0` → `[]`。

`info` オブジェクトではなく `pagesInSpread`（数値）を受け取り、依存を最小化してテスト容易にする。

### 共通ヘルパー（`src/content/navigation.ts`）

```
resolvePageData(url, signal?): Promise<{ imageUrl: string; followingUrl: string }>
```

- `fetchViewerDocument(url, signal)` で doc を取得（既存の `viewerDocCache` を利用）。
- `getImageUrlFromDocument` / `getNextPageUrlFromDocument` で `imageUrl` / `followingUrl` を抽出。
- マップ更新: `page = getViewerPageFromUrl(url)` に対し `imageUrl` があれば
  `pageImageMap[page] = imageUrl`。`followingUrl` があれば、その URL のページ番号に対し
  `pageUrlMap[fp] = followingUrl`。最後に `persistPageMaps()`。
- 戻り値で `imageUrl` / `followingUrl` を返す。

これにより以下3か所の重複ブロックを `resolvePageData` 呼び出しへ置換する:

- `preloadAheadFrom`（`preloader.ts:211-237`、非オーバーレイ。`preloadState`・画像DL・
  チェーンの外枠は維持しつつ抽出部のみ差し替え）
- `loadPartnerImage`（`spread.ts:46-60`）
- `resolvePageImage`（`spread.ts:154-165`）

### 並列先読み本体（`src/content/preloader.ts`）

新規 `preloadPagesAhead(pages: number[]): Promise<void>`:

```
preloadPagesAhead(pages):
  1. URL 確保: pages のうち pageUrlMap に無いものがあれば、
     その先頭ページを覆うギャラリー一覧を1回だけ取得（既存 fetchGalleryPageUrls を await）。
     一覧1ページ ≈ 40 件のため通常は窓全体を一度に充足。URL があれば no-op。
  2. 並列実行: pages を map して prefetchOnePage(page, depth, runId) を一斉に起動
     （depth = 配列インデックス+1、ステータス表示用）。await 間にバリアを置かない。
```

新規 `prefetchOnePage(page, depth, runId)`:

```
- runId !== preloadRunId → 破棄
- preloadedImages に page 有り（バイト取得済み）→ setPreloadState(loaded) して終了（スキップ）
- url = pageUrlMap[page]; 無ければ setPreloadState(failed) して終了
- setPreloadState(loading, page, method:'fetch')
- resolvePageData(url, signal)
    → imageUrl が無ければ failed
    → preloadImage(page, imageUrl) でバイト先読み
    → setPreloadState(loaded, duration, method:'img')
- catch: AbortError は無視、それ以外は setPreloadState(failed)
```

**`followingUrl` 再帰チェーンは行わない**。並列性は「窓を map して一斉起動」で得る。

### 先読みトラッキングの整理（`preloader.ts`）

- `preloadedImages: HTMLImageElement[]` を `preloadedImages: Map<number, HTMLImageElement>`
  （ページ番号→Image）に変更。スキップ判定（`has(page)`）とサムネ表示
  （`PreloadThumbs`）を 1 つの構造で兼ねる。
- `preloadImage(page, imageUrl)` に変更し、`onload` 時に `preloadedImages.set(page, image)`。
- サムネは現在窓のページ（モジュール変数 `currentWindowPages`）を `preloadedImages` で
  引いた `src` 付き Image 群とする（現行「現在窓ぶんを表示」挙動を維持）。
- `iframe` 廃止に伴い、`removeOldPreloadFrames` は `.eh-helper-preload-frame` の DOM
  走査が不要になる（フレーム生成元は `preloadByHiddenFrame` のみ）。`preloadedImages` /
  `preloadThumbs` のリセットだけを担う関数に簡素化（必要なら改名）。

### `preloadNext` のオーバーレイ分岐統合（`preloader.ts:251`）

現状の3分岐（`isOverlayActive() && virtualPage>0` / `isOverlayActive()` / 非オーバーレイ）
のうち、**2つのオーバーレイ分岐を1本化**する:

```
preloadNext():
  preloadAheadCount <= 0 → abort + reset + 'preload off'; return
  rootKey = getCurrentKey(); rootKey === lastPreloadRootKey → return; lastPreloadRootKey = rootKey
  abortActivePreload(); preloadAbortController = new AbortController()
  preloadState = {}; (現在窓・サムネのリセット)

  if isOverlayActive():
    currentPage = virtualPage.value || getViewerPageFromUrl(location.href) || 0
    total = totalPages.value || getTotalPageLabel() || 0
    info = spreadView ? getSpreadPageInfo(currentPage, total, spreadCoverAlone) : { pagesInSpread: 1 }
    pages = getPreloadWindowPages(currentPage, info.pagesInSpread, total, preloadAheadCount)
    preloadPagesAhead(pages)
    return

  // 非オーバーレイ（従来どおり）
  nextUrl = getNextPageUrl(); 無ければ 'next not found'; return
  preloadAheadFrom(nextUrl, 1)
```

`preloadPagesAhead` は非同期だが、`preloadNext` は従来どおり fire-and-forget で呼ぶ。

## データフロー

```
画像ロード完了 → schedulePreloadAfterCurrentImage → (PRELOAD_DELAY_MS) → preloadNext
preloadNext（オーバーレイ）
  → getPreloadWindowPages で窓 [p1..pN] 算出
  → preloadPagesAhead
      → (URL 不足なら) fetchGalleryPageUrls を1回 await
      → pages を並列に prefetchOnePage
          → resolvePageData(url) で imageUrl 解決＋マップ更新
          → preloadImage(page, imageUrl) でバイト先読み（preloadedImages に登録）
  → 次に advance/seek した際、renderSpreadAtPage が pageImageMap / キャッシュ済みバイトを
    即座に表示
advance/seek → 新しい getCurrentKey → preloadNext 再実行（abort で前窓の未完了を破棄）
```

## エラー処理・エッジケース

- **URL 未取得**: ギャラリー一覧フェッチでも `pageUrlMap[page]` が埋まらなければ、
  そのページのみ `failed`（他ページの並列処理は継続）。
- **フェッチ/画像失敗**: `failed` 表示にとどめ、既存 `retryImage` と実遷移時ロードに委譲
  （iframe フォールバックは行わない）。
- **`total` 未取得（≤0）**: `getPreloadWindowPages` は打ち切りせず `count` ページ並べる
  （存在しないページは fetch 失敗→`failed` になるだけで、進行を妨げない）。
- **窓の重複**: advance ごとに窓が重なるが、完了済みは `preloadedImages` でスキップ、
  未完了は abort 後に再要求されても `fetch(cache:'force-cache')` でコストは小さい。
- **中断**: advance/seek で `abortActivePreload()` が `preloadRunId` を進め in-flight fetch を
  abort。各 then で runId を照合して陳腐化結果を破棄。
- **非オーバーレイ**: 挙動不変（`preloadAheadFrom` 逐次チェーン）。ただし iframe
  フォールバックは廃止されるため、fetch 失敗時は先読みを諦める（実遷移時に通常ロード）。

## テスト

`test/viewer-utils.test.ts`（既存）に純粋関数テストを追加:

- `getPreloadWindowPages`:
  - 通常: `(3, 2, 20, 5)` → `[5,6,7,8,9]`、`(1, 1, 20, 3)` → `[2,3,4]`。
  - `total` 打ち切り: `(18, 2, 20, 5)` → `[20]`、`(19, 2, 20, 5)` → `[]`。
  - `count=0` → `[]`。`total<=0`: `(3, 1, 0, 3)` → `[4,5,6]`（打ち切りなし）。
  - 単写（`pagesInSpread=1`）と見開き（`pagesInSpread=2`）の開始位置差。

DOM/fetch を伴う `preloadPagesAhead` / `prefetchOnePage` / `resolvePageData` 本体は
既存方針どおり手動確認（`/run` 等）。`resolvePageData` 置換後は `navigation.test.ts` /
`fit.test.ts` 等の既存テストが回帰しないことを確認する。

## リリース

実装・`npm run check` 通過後、`npm run version:patch` を独立コミットで実施。
バージョン変更を `main` にマージ／push すると `sign-addon.yml` により AMO 署名と
GitHub Release が作成される。

## スコープ外（YAGNI）

- 全件マップの事前構築（A の目的には不要。窓ぶんの URL は既存の遅延取得で足りる）。
- ギャラリーページ（`/g/*`）へのコンテンツスクリプト拡張。
- 非オーバーレイ経路の並列化。
- 同時実行上限（K）や先読み窓サイズの新設定項目。
