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
分＝既定20件・動的拡張ぶんの URL をまとめて取得済みのため）。URL が分かっているなら、
先のページを `followingUrl` 待ちで直列に辿る必要はなく、**ページ番号ベースで N ページ
分を並列に先読み**できる。

目的: **オーバーレイ時の先読みを逐次チェーンからページ番号ベースの並列先読みに
置き換え**、「次へ」進行時のカクつきを減らす。あわせて、先読み周りに散在する重複
ロジックを整理する。

また、**通常モード（非オーバーレイ）の先読みは撤去する**。E-Hentai の画像 URL は
リクエストごと（サーバーローテーション / トークン付与）に変わるため、ページ A で
先読みしたバイト（URL-A）は、次ページが自前ロード時に生成する URL-B と一致せず
HTTP キャッシュがヒットしない。通常モードでは実遷移＝フルページロードのたびに
拡張の JS コンテキストも作り直されるため、現状の `preloadAheadFrom` は実効性が無い
（前回調査の結論）。オーバーレイは拡張自身が同じ解決済み URL を再利用するため効く。
撤去により `preloadAheadFrom` / `preloadByHiddenFrame` をまるごと削除でき、ロジックも
簡潔になる。なお `overlayView` / `spreadView` の既定は `false`（既定は通常モード）で
あり、現状は「効かない先読みが既定で走っている」状態である点も撤去の根拠となる。

## 確定した設計判断

- **スコープはオーバーレイ時のみ**。通常モード（非オーバーレイ）の先読みは
  **撤去**する（実効性が無いため。上記「背景・目的」参照）。これに伴い
  `preloadAheadFrom` と `preloadByHiddenFrame` を削除する。`preloadAheadCount`
  設定はオーバーレイ時の並列窓サイズとしてのみ機能するようになる（UI は変更しない）。
- 並列窓のサイズ N = `preloadAheadCount`（0〜5 にクランプ、`popup/main.ts:104`）。
  窓は**ページ単位**で数える（見開きでも次の N **ページ**。N=5 で約2〜3見開き先）。
- **キャッシュ済みはスキップ**: 画像バイト取得済みのページは再フェッチしない。
  窓 ≤ 5 かつスキップありのため、同時フェッチは最大5本・実際はそれ未満。別途の
  同時実行上限（K）は設けない。
- **バイトキャッシュは「ギャラリーセッション中の短期キャッシュ」**: 先読み済みページの
  追跡（`preloadedPages: Set<number>`）は advance／seek をまたいで**保持**し、重複する
  先読み窓でスキップが効くようにする。クリアはオーバーレイ teardown 時のみ
  （`removeSpreadOverlayState`）。窓・サムネ状態（`windowImages` / `currentWindowPages`）
  はこれと分離し、`preloadNext` のたびにリセットする。
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

これにより以下の重複ブロックを `resolvePageData` 呼び出しへ置換・集約する:

- `loadPartnerImage`（`spread.ts:46-60`）
- `resolvePageImage`（`spread.ts:154-165`）
- 新規 `prefetchOnePage`（本仕様、`preloader.ts`）

（旧 `preloadAheadFrom` は撤去するため対象外。）

### 並列先読み本体（`src/content/preloader.ts`）

新規 `preloadPagesAhead(pages: number[]): Promise<void>`:

```
preloadPagesAhead(pages, runId):
  1. URL 確保 ensureWindowUrls(pages, runId):
     pages に pageUrlMap 未取得のものがある限り、
     残っている先頭の未取得ページを覆うギャラリー一覧を取得（fetchGalleryPageUrls を await）。
     取得後に未取得数が減らなければ（進捗なし）打ち切り（無限ループ防止）。
     ※窓が一覧ページ境界（既定20件区切り）をまたぐ場合に複数ページ取得する。
       URL が揃っていれば no-op。galleryUrl 不明なら何もしない。
  2. 並列実行: pages を map して prefetchOnePage(page, depth, runId) を一斉に起動
     （depth = 配列インデックス+1、ステータス表示用）。await 間にバリアを置かない。
```

新規 `prefetchOnePage(page, depth, runId)`:

```
- runId !== preloadRunId → 破棄
- preloadedPages に page 有り（バイト取得済み）→ setPreloadState(loaded, 'cache') 終了（スキップ）
- setPreloadState(loading, page, method:'fetch')
- 画像 URL 既知（pageImageMap[page] 有り）→ doc フェッチを省略し preloadImage(page, url, runId)
  → 成功で setPreloadState(loaded, 'img')
- 未知 → url = pageUrlMap[page]; 無ければ setPreloadState(failed) 終了
       → resolvePageData(url, signal) → imageUrl 無ければ failed
       → preloadImage(page, imageUrl, runId) でバイト先読み → setPreloadState(loaded, 'img')
- catch: AbortError は無視、それ以外は setPreloadState(failed)
```

`preloadImage(page, imageUrl, runId)` は `new Image()` のバイト先読み。**`onload` 時点で
`runId === preloadRunId` を確認してから** `preloadedPages.add(page)` / `windowImages.set(page, image)`
する（`Image` のロードは AbortController で止まらないため、古い run の完了がキャッシュへ
混入するのを防ぐ）。

**`followingUrl` 再帰チェーンは行わない**。並列性は「窓を map して一斉起動」で得る。

### 先読みトラッキングの整理（`preloader.ts`）

旧 `preloadedImages: HTMLImageElement[]` を、役割の異なる2つの構造に分離する:

- **`preloadedPages: Set<number>`（永続）** — バイト先読み済みページの追跡。advance／seek を
  またいで保持し、重複窓のスキップを成立させる。`preloadNext` ではリセットしない。
  クリアは teardown のみ（後述 `resetPreloadCache`）。番号集合なのでメモリは軽い。
- **`windowImages: Map<number, HTMLImageElement>`（窓ごと）** — 現在窓のサムネ表示用
  （`PreloadThumbs`、既定 OFF）。`preloadNext` のたびにリセット。サムネは
  `currentWindowPages` を `windowImages` で引いた `src` 付き Image 群とする。
  ※スキップされたページ（既に warm）はサムネに出ない（診断用途のため許容）。
- 関数の整理:
  - `resetWindowState()` — `windowImages` / `currentWindowPages` / `preloadThumbs` のみリセット
    （`preloadNext` 冒頭で呼ぶ。旧 `removeOldPreloadFrames` の置換）。
  - `resetPreloadCache()`（**新規 export**）— `abortActivePreload()` ＋ `preloadedPages.clear()`
    ＋ `resetWindowState()` ＋ `lastPreloadRootKey=''`。`spread.ts` の
    `removeSpreadOverlayState` から呼び、teardown でセッションキャッシュを破棄する。
- `iframe` 廃止に伴い `.eh-helper-preload-frame` の DOM 走査は不要（生成元 `preloadByHiddenFrame`
  を削除するため）。`addon/content/content.css` の同クラスのルールも削除する。

### `preloadNext` のオーバーレイ分岐統合（`preloader.ts:251`）

現状の3分岐（`isOverlayActive() && virtualPage>0` / `isOverlayActive()` / 非オーバーレイ）
のうち、**2つのオーバーレイ分岐を1本化**し、**非オーバーレイ分岐は撤去**する:

```
preloadNext():
  preloadAheadCount <= 0 → abort + resetWindowState + 'preload off'; return
  if !isOverlayActive() → return          // 通常モードは先読みしない（撤去）
  rootKey = getCurrentKey(); rootKey === lastPreloadRootKey → return; lastPreloadRootKey = rootKey
  abortActivePreload(); preloadAbortController = new AbortController()
  resetWindowState(); preloadState = {}     // ※ preloadedPages はリセットしない（永続）
  runId = preloadRunId

  currentPage = virtualPage.value || getViewerPageFromUrl(location.href) || 0
  total = totalPages.value || getTotalPageLabel() || 0
  info = spreadView ? getSpreadPageInfo(currentPage, total, spreadCoverAlone) : { pagesInSpread: 1 }
  pages = getPreloadWindowPages(currentPage, info.pagesInSpread, total, preloadAheadCount)
  currentWindowPages = pages
  preloadPagesAhead(pages, runId)
```

`preloadPagesAhead` は非同期だが、`preloadNext` は従来どおり fire-and-forget で呼ぶ。

`schedulePreloadAfterCurrentImage`（`main.tsx:35,135`・`spread.ts:231` から呼ばれる）は
そのまま残す。通常モードでは `preloadNext` が早期 return するため実質 no-op となる。
**削除対象**: `preloadAheadFrom`、`preloadByHiddenFrame`、および両者専用の補助
（`method:'iframe'` 経路など）。

## データフロー

```
画像ロード完了 → schedulePreloadAfterCurrentImage → (PRELOAD_DELAY_MS) → preloadNext
preloadNext（オーバーレイ）
  → getPreloadWindowPages で窓 [p1..pN] 算出
  → preloadPagesAhead
      → ensureWindowUrls: URL 不足ぶんの一覧ページを揃うまで（進捗ある限り）await
      → pages を並列に prefetchOnePage（preloadedPages 済みはスキップ）
          → resolvePageData(url) で imageUrl 解決＋マップ更新（既知なら doc フェッチ省略）
          → preloadImage(page, imageUrl, runId) でバイト先読み（runId 一致時のみ登録）
  → 次に advance/seek した際、renderSpreadAtPage が pageImageMap / キャッシュ済みバイトを
    即座に表示
advance/seek → 新しい getCurrentKey → preloadNext 再実行（abort で前窓の未完了を破棄）
```

## エラー処理・エッジケース

- **ギャラリー一覧の境界またぎ**: 窓が一覧ページ（既定20件区切り）をまたぐ場合、
  `ensureWindowUrls` が未取得ページが残る限り該当一覧ページを追加 fetch する
  （進捗が無くなったら打ち切り）。これにより窓後半（例: `[19,20,21,22,23]` の 21+）が
  `failed` になる問題を防ぐ。
- **URL 未取得**: 一覧フェッチでも `pageUrlMap[page]` が埋まらなければ、そのページのみ
  `failed`（他ページの並列処理は継続）。
- **フェッチ/画像失敗**: `failed` 表示にとどめ、既存 `retryImage` と実遷移時ロードに委譲
  （iframe フォールバックは行わない）。
- **`total` 未取得（≤0）**: `getPreloadWindowPages` は打ち切りせず `count` ページ並べる
  （存在しないページは fetch 失敗→`failed` になるだけで、進行を妨げない）。
- **窓の重複**: advance ごとに窓が重なるが、`preloadedPages`（永続）に登録済みのページは
  スキップされるため再フェッチしない。新規ぶんのみ取得する。
- **中断**: advance/seek で `abortActivePreload()` が `preloadRunId` を進め in-flight fetch を
  abort。各 then で runId を照合して陳腐化結果を破棄。`Image` のロードは abort できないため、
  `preloadImage` は `onload` 時に runId を再確認してからキャッシュへ保存する（古い run の
  完了が新しいキャッシュを汚染しない）。
- **teardown**: オーバーレイ終了／spread 解除（`removeSpreadOverlayState`）で `resetPreloadCache`
  を呼び、`preloadedPages` を含む先読み状態を破棄＋in-flight を abort。
- **非オーバーレイ（通常モード）**: 先読みを一切行わない（`preloadNext` が早期 return）。
  ページ送りは従来どおり実遷移＝通常ロード。`showStatus('EH: preload off')` は
  `preloadAheadCount<=0` のときのみで、通常モードの早期 return ではステータスを出さない
  （ノイズ回避）。

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
- 非オーバーレイ経路の先読み（並列・逐次とも。実効性が無いため撤去）。
- 同時実行上限（K）や先読み窓サイズの新設定項目。
