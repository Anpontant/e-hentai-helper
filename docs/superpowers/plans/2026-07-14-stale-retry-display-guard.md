# 遅延した画像再試行による表示上書き防止 Implementation Plan

> **エージェント作業者向け:** 実装時は `superpowers:subagent-driven-development`（推奨）または `superpowers:executing-plans` を必須サブスキルとして使用する。各手順はチェックボックス単位で追跡する。

**Goal:** ページ移動後に完了した古い画像再試行が現在のオーバーレイ表示を上書きしないようにしつつ、再試行対象ページのキャッシュ更新は保持する。

**Architecture:** `retryImage()` が取得した画像は従来どおり対象ページのキャッシュへ保存する。画面へ反映する直前に、取得開始時の表示位置が現在も同じページを表しているかをページ番号で照合し、不一致なら表示更新だけを破棄する。

**Tech Stack:** TypeScript、Preact Signals、Vitest、happy-dom

## Global Constraints

- 変更対象は `src/content/spread.ts` と `test/spread.test.ts` に限定する。
- 無操作時の URL 同期、通常のページ解決、プリロード、ナビゲーション方向、見開き計算は変更しない。
- `pageImageMap` と `viewerDataCache` への再試行結果の保存は維持する。
- 本番コードを変更する前に、回帰テストが意図した理由で失敗することを確認する。
- 実装コミット前に `npm run check` を実行し、すべて成功させる。

---

### Task 1: 遅延した画像再試行の表示上書きを防ぐ

**Files:**

- Modify: `test/spread.test.ts`
- Modify: `src/content/spread.ts:266-311`

**Interfaces:**

- Consumes: `retryImage(side: 'left' | 'right'): void`、`advanceSpread(): void`、`virtualPage`、`spreadState`、`totalPages`、`settings`、`pageUrlMap`、`pageImageMap`、`viewerDataCache`
- Produces: 内部ヘルパー `getCurrentPageForSide(side: 'left' | 'right'): number`。現在その表示位置に割り当てられているページ番号を返し、該当ページがなければ `0` を返す。

- [ ] **Step 1: 遅延した再試行を再現する失敗テストを書く**

`test/spread.test.ts` の spread import を次のように更新する。

```ts
import { advanceSpread, renderSpread, retryImage } from '../src/content/spread.js';
```

画像 URL 定義の直後へ、再試行後の画像 URL を追加する。

```ts
const RETRIED_IMAGE_URL = (page: number) => 'https://img.example/page' + page + '-retry.jpg';
```

ファイル末尾へ次のテストを追加する。

```ts
describe('retryImage navigation race', () => {
  test('keeps a newer spread visible when an older retry completes', async () => {
    setupViewerDom(2, 40);
    stubLocation(2);
    pageUrlMap[3] = PAGE_URL(3);
    pageImageMap[3] = IMAGE_URL(3);
    pageUrlMap[4] = PAGE_URL(4);
    pageImageMap[4] = IMAGE_URL(4);
    pageUrlMap[5] = PAGE_URL(5);
    pageImageMap[5] = IMAGE_URL(5);

    renderSpread();

    let resolveRetry!: (response: Response) => void;
    const retryResponse = new Promise<Response>((resolve) => {
      resolveRetry = resolve;
    });
    const fetchMock = vi.fn(() => retryResponse);
    vi.stubGlobal('fetch', fetchMock);

    retryImage('left');
    advanceSpread();

    expect(virtualPage.value).toBe(4);
    expect(spreadState.value.rightSrc).toBe(IMAGE_URL(4));
    expect(spreadState.value.leftSrc).toBe(IMAGE_URL(5));

    resolveRetry({
      ok: true,
      text: () =>
        Promise.resolve(
          `<a href="${PAGE_URL(4)}"><img id="img" src="${RETRIED_IMAGE_URL(3)}" /></a>`
        )
    } as Response);

    await vi.waitFor(() => expect(pageImageMap[3]).toBe(RETRIED_IMAGE_URL(3)));

    expect(fetchMock).toHaveBeenCalledWith(PAGE_URL(3), {
      credentials: 'include',
      cache: 'reload'
    });
    expect(viewerDataCache.get(PAGE_URL(3))?.imageUrl).toBe(RETRIED_IMAGE_URL(3));
    expect(virtualPage.value).toBe(4);
    expect(spreadState.value.rightSrc).toBe(IMAGE_URL(4));
    expect(spreadState.value.leftSrc).toBe(IMAGE_URL(5));
  });
});
```

- [ ] **Step 2: 回帰テストが意図した理由で失敗することを確認する**

Run:

```bash
npx vitest run test/spread.test.ts
```

Expected: 新しいテストだけが失敗し、最後の `leftSrc` が期待値 `page5.jpg` ではなく、遅れて完了した `page3-retry.jpg` になる。構文エラーや未定義エラーでは失敗しない。

- [ ] **Step 3: 現在の表示位置に割り当てられたページを求める内部ヘルパーを追加する**

`src/content/spread.ts` の `retryImage()` 直前へ追加する。

```ts
function getCurrentPageForSide(side: 'left' | 'right'): number {
  const rightPage = virtualPage.value;
  if (!rightPage) return 0;
  if (side === 'right') return rightPage;

  const s = settings.value;
  if (!s.spreadView) return 0;

  const info = getSpreadPageInfo(rightPage, totalPages.value, s.spreadCoverAlone);
  return info.partnerPage || 0;
}
```

- [ ] **Step 4: キャッシュ保存後の画面更新をページ番号で制限する**

`retryImage()` の `persistPageMaps();` 直後へ次の早期 return を追加し、その後の左右更新は現状のまま残す。

```ts
if (getCurrentPageForSide(side) !== page) return;
```

完成後の該当部分は次の形になる。

```ts
pageImageMap[page] = imageUrl;
persistPageMaps();
if (getCurrentPageForSide(side) !== page) return;
if (side === 'right') {
  spreadState.value = { ...spreadState.value, rightSrc: imageUrl, rightFallbackSrc: '' };
} else {
  spreadState.value = { ...spreadState.value, leftSrc: imageUrl };
}
```

- [ ] **Step 5: 対象テストが成功することを確認する**

Run:

```bash
npx vitest run test/spread.test.ts
```

Expected: `test/spread.test.ts` の全テストが成功し、警告や未処理 Promise が出ない。

- [ ] **Step 6: リポジトリ全体の品質ゲートを実行する**

Run:

```bash
npm run check
```

Expected: `typecheck`、`lint`、`format:check`、`test`、`build`、`addon:lint`、`addon:build` がすべて成功する。

- [ ] **Step 7: 修正を独立コミットにする**

```bash
git add src/content/spread.ts test/spread.test.ts
git commit -m "fix: keep stale image retries from replacing newer pages"
```

この subject は、利用者に見える修正内容を現在形で表し、GitHub Release の Bug Fixes に掲載される。
