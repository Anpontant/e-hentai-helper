# オーバーレイ並列先読み Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** オーバーレイ表示時の先読みを逐次チェーンからページ番号ベースの並列先読みに置き換え、通常モードの（効かない）先読みを撤去する。

**Architecture:** 純粋関数 `getPreloadWindowPages` で先読み対象ページ窓を算出し、共通ヘルパー `resolvePageData` でビューア doc→画像 URL 解決を一本化。`preloader.ts` はオーバーレイ時のみ、窓内の各ページを並列に prefetch（キャッシュ済みスキップ、最大5並列）する。非オーバーレイ経路と iframe フォールバック（`preloadAheadFrom` / `preloadByHiddenFrame`）は削除。

**Tech Stack:** TypeScript, Preact + @preact/signals, esbuild, Vitest, ESLint/Prettier, web-ext。

## Global Constraints

- ソースは `src/` のみ編集。`addon/content/content.js` / `addon/popup/popup.js` はビルド生成物（編集禁止）。`addon/content/content.css` は手編集対象。
- 各変更コミット前に `npm run check`（lint / format:check / test / addon:lint / addon:build）が通ること。
- 改行は LF。`format:check` が未変更ファイルを指摘したら `npm run format`。
- コミットは Conventional Commits。コード・コミットメッセージは英語、本計画ドキュメントは日本語。
- 仕様書: `docs/superpowers/specs/2026-06-30-overlay-parallel-preload-design.md`。
- `preloadAheadCount` は 0〜5 にクランプ済み（`popup/main.ts:104` / `viewer-utils.ts:normalizeSettings`）。並列窓サイズに流用する。
- DOM/fetch を伴うロジックは単体テストを追加せず、`npm run check` 通過＋手動確認で担保（既存方針）。新規の純粋関数のみ Vitest で TDD する。

---

### Task 1: 先読み窓の純粋関数 `getPreloadWindowPages`

**Files:**

- Modify: `src/shared/viewer-utils.ts`（`resolveSpreadPage` の後、`clamp` の前あたりに追加）
- Test: `test/viewer-utils.test.ts`

**Interfaces:**

- Consumes: なし。
- Produces: `getPreloadWindowPages(currentPage: number, pagesInSpread: number, total: number, count: number): number[]` — 現在ページ/見開きの「次」から最大 `count` ページの配列。`total > 0` のとき `total` で打ち切り。`count <= 0` は `[]`。

- [ ] **Step 1: 失敗するテストを書く**

`test/viewer-utils.test.ts` の末尾（最後の `describe` の後）に追加:

```ts
describe('getPreloadWindowPages', () => {
  test('returns the next count pages after the current spread', () => {
    expect(utils.getPreloadWindowPages(3, 2, 20, 5)).toEqual([5, 6, 7, 8, 9]);
    expect(utils.getPreloadWindowPages(1, 1, 20, 3)).toEqual([2, 3, 4]);
  });

  test('truncates at total', () => {
    expect(utils.getPreloadWindowPages(18, 2, 20, 5)).toEqual([20]);
    expect(utils.getPreloadWindowPages(19, 2, 20, 5)).toEqual([]);
  });

  test('count of 0 yields no pages', () => {
    expect(utils.getPreloadWindowPages(3, 2, 20, 0)).toEqual([]);
  });

  test('unknown total (<=0) does not truncate', () => {
    expect(utils.getPreloadWindowPages(3, 1, 0, 3)).toEqual([4, 5, 6]);
  });

  test('single vs spread changes the start offset', () => {
    expect(utils.getPreloadWindowPages(4, 1, 0, 2)).toEqual([5, 6]);
    expect(utils.getPreloadWindowPages(4, 2, 0, 2)).toEqual([6, 7]);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npm test -- viewer-utils`
Expected: FAIL（`utils.getPreloadWindowPages is not a function`）

- [ ] **Step 3: 最小実装を書く**

`src/shared/viewer-utils.ts`、`resolveSpreadPage` 関数（94行目で終わる）の直後に追加:

```ts
export function getPreloadWindowPages(
  currentPage: number,
  pagesInSpread: number,
  total: number,
  count: number
): number[] {
  const pages: number[] = [];
  const start = currentPage + pagesInSpread;
  for (let i = 0; i < count; i += 1) {
    const page = start + i;
    if (page < 1) continue;
    if (total > 0 && page > total) break;
    pages.push(page);
  }
  return pages;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- viewer-utils`
Expected: PASS（`getPreloadWindowPages` の全ケース緑）

- [ ] **Step 5: 品質ゲートを通す**

Run: `npm run check`
Expected: lint / format:check / test / addon:lint / addon:build すべて成功

- [ ] **Step 6: コミット**

```bash
git add src/shared/viewer-utils.ts test/viewer-utils.test.ts
git commit -m "feat: add getPreloadWindowPages page-window helper"
```

---

### Task 2: 共通ヘルパー `resolvePageData` 抽出と spread.ts のリファクタ

**Files:**

- Modify: `src/content/navigation.ts`（`fetchViewerDocument` の直後に追加、175行目付近）
- Modify: `src/content/spread.ts`（import 行、`loadPartnerImage`、`resolvePageImage`）

**Interfaces:**

- Consumes: なし。
- Produces: `resolvePageData(url: string, signal?: AbortSignal): Promise<{ imageUrl: string; followingUrl: string }>` — `fetchViewerDocument` でビューア doc を取得し、画像 URL・次 URL を抽出してマップ（`pageImageMap` / `pageUrlMap`）を更新＋`persistPageMaps()`。

これは挙動を変えないリファクタ。テストは既存スイート＋ビルドで担保する。

- [ ] **Step 1: `resolvePageData` を追加**

`src/content/navigation.ts`、`fetchViewerDocument` 関数（175行目 `}` で終わる）の直後に追加:

```ts
export function resolvePageData(
  url: string,
  signal?: AbortSignal
): Promise<{ imageUrl: string; followingUrl: string }> {
  return fetchViewerDocument(url, signal).then(function (doc) {
    const imageUrl = getImageUrlFromDocument(doc, url);
    const followingUrl = getNextPageUrlFromDocument(doc, url);
    const page = parseInt(getViewerPageFromUrl(url), 10);
    if (page && imageUrl) pageImageMap[page] = imageUrl;
    if (followingUrl) {
      const followingPage = parseInt(getViewerPageFromUrl(followingUrl), 10);
      if (followingPage) pageUrlMap[followingPage] = followingUrl;
    }
    persistPageMaps();
    return { imageUrl: imageUrl, followingUrl: followingUrl };
  });
}
```

- [ ] **Step 2: ビルドで型エラーが無いことを確認**

Run: `npm run build`
Expected: 成功（`resolvePageData` がコンパイルされる）

- [ ] **Step 3: spread.ts の import を更新**

`src/content/spread.ts` の navigation import ブロック（7-21行目）を次に置き換える。`getNextPageUrlFromDocument` と `fetchViewerDocument` を削除し、`resolvePageData` を追加:

```ts
import {
  getMainImage,
  getNextPageUrl,
  getGalleryBaseUrl,
  fetchGalleryPageUrls,
  getImageUrlFromDocument,
  getTotalPageLabel,
  resolvePageData,
  viewerDocCache,
  pageUrlMap,
  pageImageMap,
  persistPageMaps,
  clearPageMapsStorage
} from './navigation.js';
```

- [ ] **Step 4: `loadPartnerImage` を `resolvePageData` で書き換え**

`src/content/spread.ts` の `loadPartnerImage`（30-65行目）の `fetchViewerDocument(...)...catch` ブロック（46-64行目）を置き換える。関数全体を次の形にする:

```ts
function loadPartnerImage(partnerPage: number, runId: number, callback: (src: string) => void) {
  const cachedImage = pageImageMap[partnerPage];
  if (cachedImage) {
    callback(cachedImage);
    return;
  }

  const partnerUrl = pageUrlMap[partnerPage] || getNextPageUrl();
  if (!partnerUrl) {
    callback('');
    return;
  }

  pageUrlMap[partnerPage] = partnerUrl;
  persistPageMaps();

  resolvePageData(partnerUrl)
    .then(function (data) {
      if (runId !== spreadRenderRunId) return;
      if (data.imageUrl) {
        pageImageMap[partnerPage] = data.imageUrl;
        callback(data.imageUrl);
      }
    })
    .catch(function () {
      if (runId !== spreadRenderRunId) return;
      callback('');
    });
}
```

- [ ] **Step 5: `resolvePageImage` を `resolvePageData` で書き換え**

`src/content/spread.ts` の `resolvePageImage`（148-179行目）の `url` 分岐（153-169行目の `fetchViewerDocument(...)...catch`）を置き換える。関数全体を次の形にする:

```ts
function resolvePageImage(page: number): Promise<string> {
  const cached = pageImageMap[page];
  if (cached) return Promise.resolve(cached);

  const url = pageUrlMap[page];
  if (url) {
    return resolvePageData(url)
      .then(function (data) {
        return data.imageUrl;
      })
      .catch(function () {
        return '';
      });
  }

  const galleryUrl = getGalleryBaseUrl();
  if (!galleryUrl) return Promise.resolve('');

  return fetchGalleryPageUrls(galleryUrl, page).then(function () {
    const resolved = pageUrlMap[page];
    if (!resolved) return '';
    return resolvePageImage(page);
  });
}
```

- [ ] **Step 6: 品質ゲートを通す**

Run: `npm run check`
Expected: 成功。特に lint で「未使用 import（`getNextPageUrlFromDocument` / `fetchViewerDocument`）」エラーが出ないこと（Step 3 で削除済み）。`test/navigation.test.ts` 等の既存テストが緑のまま。

- [ ] **Step 7: コミット**

```bash
git add src/content/navigation.ts src/content/spread.ts
git commit -m "refactor: extract resolvePageData and reuse in spread view"
```

---

### Task 3: preloader.ts をオーバーレイ専用の並列先読みに刷新

**Files:**

- Modify: `src/content/preloader.ts`（ファイル全体を置き換え）
- Modify: `addon/content/content.css`（`.eh-helper-preload-frame` ルール削除）

**Interfaces:**

- Consumes: `getPreloadWindowPages`（Task 1）、`resolvePageData`（Task 2）。
- Produces: 既存エクスポートを維持 — `abortActivePreload()`, `resetPreloadRootKey()`, `preloadNext()`, `schedulePreloadAfterCurrentImage()`。シグネチャ不変（呼び出し側 `main.tsx` / `spread.ts` は変更不要）。

削除: `preloadAheadFrom`, `preloadByHiddenFrame`, `removeOldPreloadFrames`（内部関数。`resetPreloadTracking` に置換）。`preloadedImages` を `Map<number, HTMLImageElement>` 化。DOM/fetch ロジックのため新規単体テストは追加せず、`npm run check` ＋手動確認で担保。

- [ ] **Step 1: preloader.ts をまるごと置き換え**

`src/content/preloader.ts` の全内容を次に置き換える:

```ts
import { settings, preloadThumbs, virtualPage, totalPages } from './state.js';
import { PRELOAD_DELAY_MS, LOG, IMAGE_PRELOAD_TIMEOUT_MS } from '../shared/constants.js';
import {
  getViewerPageFromUrl,
  getSpreadPageInfo,
  getPreloadWindowPages,
  formatDuration
} from '../shared/viewer-utils.js';
import {
  getMainImage,
  getCurrentKey,
  getGalleryBaseUrl,
  fetchGalleryPageUrls,
  getTotalPageLabel,
  resolvePageData,
  pageUrlMap
} from './navigation.js';
import type { PreloadStateEntry } from '../shared/types.js';
import { isOverlayActive, showStatus, showStatusLines } from './status.js';

let lastPreloadRootKey = '';
let preloadState: Record<number, PreloadStateEntry> = {};
let preloadRunId = 0;
let preloadedImages: Map<number, HTMLImageElement> = new Map();
let currentWindowPages: number[] = [];
let preloadAbortController: AbortController | null = null;

function log(...args: unknown[]) {
  if (!LOG || !window.console) return;
  console.log.apply(console, ['[EH helper]', ...args]);
}

export function abortActivePreload() {
  if (preloadAbortController) {
    preloadAbortController.abort();
    preloadAbortController = null;
  }
  preloadRunId += 1;
}

export function resetPreloadRootKey() {
  lastPreloadRootKey = '';
}

function resetPreloadTracking() {
  preloadedImages = new Map();
  currentWindowPages = [];
  preloadThumbs.value = [];
}

function updatePreloadThumbs() {
  if (!settings.value.showPreloadThumbs) return;
  const thumbs: HTMLImageElement[] = [];
  for (let i = 0; i < currentWindowPages.length; i += 1) {
    const img = preloadedImages.get(currentWindowPages[i]);
    if (img && img.src) thumbs.push(img);
  }
  preloadThumbs.value = thumbs;
}

function updatePreloadStatus() {
  const parts: string[] = [];
  for (let i = 1; i <= settings.value.preloadAheadCount; i += 1) {
    const item = preloadState[i];
    if (!item) continue;

    if (item.status === 'loading') {
      parts.push('EH: +' + i + ' loading p.' + item.page);
    } else if (item.status === 'loaded') {
      parts.push(
        'EH: +' +
          i +
          ' loaded p.' +
          item.page +
          ' ' +
          formatDuration(item.duration) +
          ' ' +
          item.method
      );
    } else if (item.status === 'failed') {
      parts.push('EH: +' + i + ' failed p.' + item.page);
    }
  }

  if (parts.length) showStatusLines(parts);
  updatePreloadThumbs();
}

function setPreloadState(depth: number, patch: Partial<PreloadStateEntry>) {
  preloadState[depth] = Object.assign(preloadState[depth] || {}, patch);
  if (settings.value.showStatus) updatePreloadStatus();
}

function preloadImage(page: number, imageUrl: string) {
  return new Promise<void>(function (resolve, reject) {
    const image = new Image();
    const timeout = window.setTimeout(function () {
      reject(new Error('image preload timeout'));
    }, IMAGE_PRELOAD_TIMEOUT_MS);

    image.onload = function () {
      window.clearTimeout(timeout);
      preloadedImages.set(page, image);
      resolve();
    };
    image.onerror = function () {
      window.clearTimeout(timeout);
      reject(new Error('image preload failed'));
    };
    image.decoding = 'async';
    image.src = imageUrl;
  });
}

function prefetchOnePage(page: number, depth: number, runId: number) {
  if (runId !== preloadRunId) return Promise.resolve();

  const existing = preloadedImages.get(page);
  if (existing && existing.src) {
    setPreloadState(depth, { status: 'loaded', page: String(page), duration: 0, method: 'cache' });
    return Promise.resolve();
  }

  const url = pageUrlMap[page];
  if (!url) {
    setPreloadState(depth, { status: 'failed', page: String(page), duration: 0, method: 'fetch' });
    return Promise.resolve();
  }

  const startedAt = Date.now();
  setPreloadState(depth, {
    status: 'loading',
    page: String(page),
    duration: 0,
    url: url,
    method: 'fetch'
  });

  return resolvePageData(url, preloadAbortController ? preloadAbortController.signal : undefined)
    .then(function (data) {
      if (runId !== preloadRunId) return;
      if (!data.imageUrl) throw new Error('next image url not found');
      return preloadImage(page, data.imageUrl).then(function () {
        if (runId !== preloadRunId) return;
        setPreloadState(depth, {
          status: 'loaded',
          page: String(page),
          duration: Date.now() - startedAt,
          method: 'img'
        });
      });
    })
    .catch(function (error) {
      if (error && error.name === 'AbortError') return;
      log('parallel preload failed:', error);
      if (runId === preloadRunId) {
        setPreloadState(depth, {
          status: 'failed',
          page: String(page),
          duration: Date.now() - startedAt,
          method: 'fetch'
        });
      }
    });
}

function preloadPagesAhead(pages: number[]) {
  const runId = preloadRunId;
  const missing = pages.filter(function (page) {
    return !pageUrlMap[page];
  });

  let ensureUrls: Promise<unknown>;
  if (missing.length) {
    const galleryUrl = getGalleryBaseUrl();
    ensureUrls = galleryUrl
      ? fetchGalleryPageUrls(galleryUrl, missing[0]).catch(function () {})
      : Promise.resolve();
  } else {
    ensureUrls = Promise.resolve();
  }

  return ensureUrls.then(function () {
    if (runId !== preloadRunId) return;
    pages.forEach(function (page, index) {
      prefetchOnePage(page, index + 1, runId);
    });
  });
}

export function preloadNext() {
  if (settings.value.preloadAheadCount <= 0) {
    abortActivePreload();
    resetPreloadTracking();
    preloadState = {};
    showStatus('EH: preload off');
    return;
  }

  if (!isOverlayActive()) return;

  const rootKey = getCurrentKey();
  if (rootKey === lastPreloadRootKey) return;
  lastPreloadRootKey = rootKey;
  abortActivePreload();
  preloadAbortController = new AbortController();
  resetPreloadTracking();
  preloadState = {};

  const currentPage = virtualPage.value || parseInt(getViewerPageFromUrl(location.href), 10) || 0;
  const total = totalPages.value || parseInt(getTotalPageLabel(), 10) || 0;
  const info = settings.value.spreadView
    ? getSpreadPageInfo(currentPage, total, settings.value.spreadCoverAlone)
    : { pagesInSpread: 1 };
  const pages = getPreloadWindowPages(
    currentPage,
    info.pagesInSpread,
    total,
    settings.value.preloadAheadCount
  );
  currentWindowPages = pages;
  preloadPagesAhead(pages);
}

export function schedulePreloadAfterCurrentImage() {
  const img = getMainImage();
  if (!img || img.complete) {
    window.setTimeout(preloadNext, PRELOAD_DELAY_MS);
    return;
  }

  img.addEventListener(
    'load',
    function () {
      window.setTimeout(preloadNext, PRELOAD_DELAY_MS);
    },
    { once: true }
  );
}
```

- [ ] **Step 2: dead な CSS ルールを削除**

`addon/content/content.css` の `.eh-helper-preload-frame { ... }` ブロック（344-353行目、前後の空行も含めて）を削除する。iframe フォールバック撤去によりこのクラスを使う要素が無くなるため。

- [ ] **Step 3: ビルドと lint で未使用 import / 型エラーが無いことを確認**

Run: `npm run build && npm run lint`
Expected: 成功。`preloader.ts` に未使用 import が残っていないこと（`pageImageMap` / `viewerDocCache` / `getNextPageUrl` 等は import していない）。

- [ ] **Step 4: 品質ゲートを通す**

Run: `npm run check`
Expected: lint / format:check / test / addon:lint / addon:build すべて成功

- [ ] **Step 5: 手動確認（オーバーレイ並列先読み）**

`addon/` を Firefox に読み込み（`npm run addon:dev` 等）、ギャラリーをビューア（`/s/`）で開く。

1. ポップアップで Overlay（または Spread）を ON、`preloadAhead` を 3〜5 に設定。
2. オーバーレイ表示にし、ステータス表示 ON で「次へ」進む。
3. ステータスに `+1 loading p.X` … `+N loaded p.Y` が**ほぼ同時**に並ぶ（逐次でなく並列）こと、再訪ページは `cache` でスキップされることを確認。
4. 「次へ」連打で前の窓が abort され、カクつきが軽減することを体感確認。
5. 通常モード（Overlay OFF）では先読みが走らない（ネットワークに `/s/` の先読み fetch が出ない）ことを DevTools で確認。

Expected: 並列先読みが機能し、通常モードでは先読みが発生しない。

- [ ] **Step 6: コミット**

```bash
git add src/content/preloader.ts addon/content/content.css
git commit -m "perf: parallelize overlay preload and drop ineffective normal-mode preload"
```

---

### Task 4: バージョン bump（リリース準備）

**Files:**

- Modify: `addon/manifest.json`、`package.json`（`npm run version:patch` が自動更新）

**Interfaces:**

- Consumes: なし。Produces: なし。

- [ ] **Step 1: patch バージョンを上げる**

Run: `npm run version:patch`
Expected: `0.8.2` → `0.8.3`（`package.json` / `addon/manifest.json` 更新）

- [ ] **Step 2: 品質ゲートを通す**

Run: `npm run check`
Expected: すべて成功

- [ ] **Step 3: コミット**

```bash
git add -A
git commit -m "chore: bump version to 0.8.3"
```

注: `main` へマージ／push すると `sign-addon.yml` が AMO 署名と GitHub Release を作成する。バージョン bump は PR の最後のコミットとする。

---

## Self-Review

**1. Spec coverage:**

- 並列先読み（A）→ Task 3（`preloadPagesAhead` / `prefetchOnePage`）✓
- ページ窓の純粋関数 → Task 1（`getPreloadWindowPages`）✓
- `resolvePageData` 集約（spread の2か所＋preloader）→ Task 2（spread 2か所）＋ Task 3（prefetchOnePage が利用）✓
- 通常モード先読み撤去 / `preloadAheadFrom`・`preloadByHiddenFrame` 削除 → Task 3 ✓
- iframe 廃止に伴う `removeOldPreloadFrames` 簡素化（`resetPreloadTracking`）と CSS 削除 → Task 3 ✓
- `preloadedImages` の Map 化 ＋ サムネ（`currentWindowPages` 経由）→ Task 3 ✓
- `preloadNext` のオーバーレイ分岐統合＋非オーバーレイ早期 return → Task 3 ✓
- 中断制御（`preloadRunId` / `preloadAbortController`）維持 → Task 3 ✓
- テスト（`getPreloadWindowPages` 境界）→ Task 1 ✓
- リリース（`version:patch`）→ Task 4 ✓

**2. Placeholder scan:** プレースホルダ・TODO・「適切に処理」等は無し。各コードステップに完全なコードを記載済み。

**3. Type consistency:**

- `getPreloadWindowPages(currentPage, pagesInSpread, total, count): number[]` — Task 1 定義、Task 3 で同シグネチャ呼び出し ✓
- `resolvePageData(url, signal?): Promise<{ imageUrl, followingUrl }>` — Task 2 定義、Task 2（spread）/ Task 3（prefetchOnePage）で `data.imageUrl` / `data.followingUrl` 参照 ✓
- `preloadedImages: Map<number, HTMLImageElement>` — `set(page, image)` / `get(page)` / `has` 相当（`get(...)?.src`）で一貫 ✓
- `preloadThumbs: Signal<HTMLImageElement[]>`（既存）に `HTMLImageElement[]` を代入 — `PreloadThumbs.tsx` の `img.src` 利用と整合 ✓
- preloader エクスポート（`abortActivePreload` / `resetPreloadRootKey` / `preloadNext` / `schedulePreloadAfterCurrentImage`）はシグネチャ不変 — 呼び出し側 `main.tsx` / `spread.ts` と整合 ✓
