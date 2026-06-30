# オーバーレイ操作拡張（ホイール送り・コントロールオーバーレイ・シークバー）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** オーバーレイ表示中にホイールでページ送り、画面中央タップでコントロールオーバーレイ（X・☰・下部シークバー）を開閉、シークバーでページジャンプできるようにする。

**Architecture:** 既存の Preact + `@preact/signals` 構成を踏襲。新規ライブラリは導入しない。ページ判定・シーク計算はすべて `src/shared/viewer-utils.ts` の純粋関数に切り出して Vitest でテストし、UI（`SpreadOverlay.tsx` / `Menu.tsx`）はその純粋関数と既存の `advanceSpread` / `retreatSpread` / 新規 `seekToPage` を呼ぶだけにする。コントロール表示状態は signal `controlsVisible` で管理する。

**Tech Stack:** TypeScript / TSX, Preact, @preact/signals, esbuild, Vitest + happy-dom。

## Global Constraints

- ソース編集は `src/` 内のみ。`addon/content/content.js` 等のビルド出力は編集しない（gitignored）。`addon/content/content.css` は手動編集対象。
- Preact JSX では `className` ではなく `class` を使う。コンポーネントの import は `.jsx` 拡張子、モジュールの import は `.js` 拡張子（例: `import { settings } from '../state.js'`）。
- 改行コードは LF。CRLF を混入させない。
- コミットメッセージは英語・Conventional Commits 形式（`feat:` / `fix:` / `test:` / `docs:` / `chore:` 等）。本文末尾に `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` を付ける。
- 新しい設定項目（`Settings`）は追加しない。
- 各タスク完了時のコミット前検証は最小単位では `npx vitest run` を使い、全タスク完了後の最終ゲートで `npm run check` を実行する。
- 作業ブランチは `feat/overlay-controls-seekbar`（作成済み）。`main` に直接コミットしない。
- 純粋関数の `import` は既存テストに合わせ `import * as utils from '../src/shared/viewer-utils.js'`（`.js` 拡張子）を使う。

---

## File Structure

- `src/shared/constants.ts`（変更）— `WHEEL_COOLDOWN_MS` 追加。
- `src/shared/viewer-utils.ts`（変更）— `getOverlayClickZone` / `pageFromSeekFraction` / `seekFractionFromPage` 追加。
- `test/viewer-utils.test.ts`（変更）— 上記3関数のテスト追加。
- `src/content/state.ts`（変更）— `controlsVisible` signal 追加。
- `src/content/spread.ts`（変更）— `seekToPage` export 追加、`removeSpreadOverlayState` で `controlsVisible` リセット。
- `src/content/components/SpreadOverlay.tsx`（変更）— ホイール処理・3ゾーンクリック・コントロール層・シークバー。
- `src/content/components/Menu.tsx`（変更）— オーバーレイ中は `controlsVisible` 時のみ ☰ を表示。
- `src/content/main.tsx`（変更）— Escape で `controlsVisible` を閉じる分岐。
- `addon/content/content.css`（変更）— コントロール層・シークバー・中央カーソルのスタイル。

---

## Task 1: 純粋関数（クリックゾーン・シーク計算）

**Files:**

- Modify: `src/shared/viewer-utils.ts`
- Test: `test/viewer-utils.test.ts`

**Interfaces:**

- Consumes: なし。
- Produces:
  - `getOverlayClickZone(fraction: number): 'next' | 'menu' | 'prev'`
  - `pageFromSeekFraction(fraction: number, total: number): number`
  - `seekFractionFromPage(page: number, total: number): number`

- [ ] **Step 1: 失敗するテストを書く**

`test/viewer-utils.test.ts` の末尾に追記する:

```typescript
describe('getOverlayClickZone', () => {
  test('splits into next / menu / prev by fraction', () => {
    expect(utils.getOverlayClickZone(0)).toBe('next');
    expect(utils.getOverlayClickZone(0.39)).toBe('next');
    expect(utils.getOverlayClickZone(0.4)).toBe('menu');
    expect(utils.getOverlayClickZone(0.5)).toBe('menu');
    expect(utils.getOverlayClickZone(0.6)).toBe('menu');
    expect(utils.getOverlayClickZone(0.61)).toBe('prev');
    expect(utils.getOverlayClickZone(1)).toBe('prev');
  });

  test('clamps out-of-range fractions', () => {
    expect(utils.getOverlayClickZone(-0.5)).toBe('next');
    expect(utils.getOverlayClickZone(1.5)).toBe('prev');
  });
});

describe('pageFromSeekFraction', () => {
  test('maps fraction endpoints to first and last page', () => {
    expect(utils.pageFromSeekFraction(0, 10)).toBe(1);
    expect(utils.pageFromSeekFraction(1, 10)).toBe(10);
  });

  test('maps middle fraction to nearest page', () => {
    expect(utils.pageFromSeekFraction(0.5, 11)).toBe(6);
  });

  test('clamps fraction and handles non-positive total', () => {
    expect(utils.pageFromSeekFraction(-1, 10)).toBe(1);
    expect(utils.pageFromSeekFraction(2, 10)).toBe(10);
    expect(utils.pageFromSeekFraction(0.5, 0)).toBe(1);
    expect(utils.pageFromSeekFraction(0.5, 1)).toBe(1);
  });
});

describe('seekFractionFromPage', () => {
  test('maps first and last page to 0 and 1', () => {
    expect(utils.seekFractionFromPage(1, 10)).toBe(0);
    expect(utils.seekFractionFromPage(10, 10)).toBeCloseTo(1);
  });

  test('returns 0 when total has no range', () => {
    expect(utils.seekFractionFromPage(1, 1)).toBe(0);
    expect(utils.seekFractionFromPage(5, 0)).toBe(0);
  });

  test('clamps page outside range', () => {
    expect(utils.seekFractionFromPage(0, 10)).toBe(0);
    expect(utils.seekFractionFromPage(99, 10)).toBeCloseTo(1);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run test/viewer-utils.test.ts`
Expected: FAIL（`getOverlayClickZone is not a function` 等）

- [ ] **Step 3: 最小実装を書く**

`src/shared/viewer-utils.ts` の末尾に追記する:

```typescript
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getOverlayClickZone(fraction: number): 'next' | 'menu' | 'prev' {
  const f = clamp(fraction, 0, 1);
  if (f < 0.4) return 'next';
  if (f > 0.6) return 'prev';
  return 'menu';
}

export function pageFromSeekFraction(fraction: number, total: number): number {
  if (total <= 0) return 1;
  const f = clamp(fraction, 0, 1);
  const page = Math.round(f * (total - 1)) + 1;
  return clamp(page, 1, total);
}

export function seekFractionFromPage(page: number, total: number): number {
  if (total <= 1) return 0;
  return clamp((page - 1) / (total - 1), 0, 1);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run test/viewer-utils.test.ts`
Expected: PASS（全テスト green）

- [ ] **Step 5: コミット**

```bash
git add src/shared/viewer-utils.ts test/viewer-utils.test.ts
git commit -m "feat: add overlay click-zone and seek math helpers"
```

---

## Task 2: 定数と状態（signal）

**Files:**

- Modify: `src/shared/constants.ts`
- Modify: `src/content/state.ts`

**Interfaces:**

- Consumes: なし。
- Produces:
  - `WHEEL_COOLDOWN_MS: number`（`constants.ts`）
  - `controlsVisible: Signal<boolean>`（`state.ts`、既定 `false`）

このタスクは定数と signal の宣言のみで、単体テストは設けない（型チェックとビルドで担保。検証は Task 7 の `npm run check`）。

- [ ] **Step 1: 定数を追加**

`src/shared/constants.ts` の `SCROLL_RETRY_DELAY_MS` の行の直後に追記する:

```typescript
export const WHEEL_COOLDOWN_MS = 200;
```

- [ ] **Step 2: signal を追加**

`src/content/state.ts` の `menuOpen` の宣言の直後に追記する:

```typescript
export const controlsVisible = signal(false);
```

- [ ] **Step 3: 型チェックで壊れていないことを確認**

Run: `npm run typecheck`
Expected: エラーなしで終了。

- [ ] **Step 4: コミット**

```bash
git add src/shared/constants.ts src/content/state.ts
git commit -m "feat: add wheel cooldown constant and controls-visible signal"
```

---

## Task 3: ページジャンプ API と状態リセット（spread.ts）

**Files:**

- Modify: `src/content/spread.ts`

**Interfaces:**

- Consumes: `controlsVisible`（Task 2）, 既存の非公開 `renderSpreadAtPage(targetPage: number, updateVirtualPage?: boolean)`。
- Produces: `seekToPage(page: number): void`（`renderSpreadAtPage` のラッパ。見開きスナップは `renderSpreadAtPage` 内の `resolveSpreadPage` が担う）。

`seekPreview` は `SpreadOverlay.tsx` のローカル signal なので spread.ts からは触らない（Task 5 で `pointerup` 時に `null` へ戻す）。

- [ ] **Step 1: `state.ts` の import に `controlsVisible` を追加**

`src/content/spread.ts` の1行目を次に置き換える:

```typescript
import { settings, spreadState, virtualPage, totalPages, controlsVisible } from './state.js';
```

- [ ] **Step 2: `seekToPage` を追加**

`src/content/spread.ts` の `retreatSpread` 関数の閉じ括弧の直後（`export function retryImage` の前）に追記する:

```typescript
export function seekToPage(page: number) {
  if (!Number.isFinite(page)) return;
  renderSpreadAtPage(Math.round(page));
}
```

- [ ] **Step 3: `removeSpreadOverlayState` でコントロール状態をリセット**

`src/content/spread.ts` の `removeSpreadOverlayState` 内、`virtualPage.value = 0;` の行の直前に追記する:

```typescript
controlsVisible.value = false;
```

- [ ] **Step 4: 型チェック**

Run: `npm run typecheck`
Expected: エラーなしで終了。

- [ ] **Step 5: コミット**

```bash
git add src/content/spread.ts
git commit -m "feat: add seekToPage and reset controls state on overlay close"
```

---

## Task 4: ホイール送りと3ゾーンクリック（SpreadOverlay.tsx）

**Files:**

- Modify: `src/content/components/SpreadOverlay.tsx`

**Interfaces:**

- Consumes: `getOverlayClickZone`（Task 1）, `WHEEL_COOLDOWN_MS`（Task 2）, `controlsVisible`（Task 2）, `menuOpen`（既存）, `advanceSpread` / `retreatSpread`（既存）。
- Produces: なし（UI 挙動）。

このタスクではホイール送りと中央ゾーンによる `controlsVisible` トグルまでを実装する。シークバー本体は Task 5。

- [ ] **Step 1: import を更新**

`src/content/components/SpreadOverlay.tsx` の冒頭 import 群を次のように変更する。

2行目 `import { spreadState, settings } from '../state.js';` を次に置き換える:

```typescript
import { spreadState, settings, controlsVisible, menuOpen } from '../state.js';
```

3行目の spread import に変更はないが、後続タスクで `seekToPage` を使うため、ここでは `advanceSpread, retreatSpread, exitOverlay, retryImage` のままにしておく。

`applySpreadFit` の import 行（5行目付近）の直後に追記する:

```typescript
import {
  getOverlayClickZone,
  pageFromSeekFraction,
  seekFractionFromPage
} from '../../shared/viewer-utils.js';
import { WHEEL_COOLDOWN_MS } from '../../shared/constants.js';
```

（`pageFromSeekFraction` / `seekFractionFromPage` は Task 5 で使うが、まとめて import してよい。Task 4 単独では未使用だと lint で `no-unused-vars` になるため、Task 5 まで一括で実装するか、Task 4 では `getOverlayClickZone` と `WHEEL_COOLDOWN_MS` のみ import し、Task 5 で残りを追加する。**本プランでは Task 4 で `getOverlayClickZone` と `WHEEL_COOLDOWN_MS` のみ import し、Task 5 で seek 関数を追加する。**）

→ つまり Task 4 で追加する import は次のみ:

```typescript
import { getOverlayClickZone } from '../../shared/viewer-utils.js';
import { WHEEL_COOLDOWN_MS } from '../../shared/constants.js';
```

- [ ] **Step 2: ホイール用のモジュール変数を追加**

`const leftError = signal(false);` / `const rightError = signal(false);` の宣言の直後に追記する:

```typescript
let lastWheelAt = 0;
```

- [ ] **Step 3: クリック/タッチのゾーン分岐を実装**

`navigateByX` 関数（`handleClick` / `handleTouchEnd` から呼ばれている）を次の `handleZone` に置き換える。`handleClick` / `handleTouchEnd` 内の `navigateByX(...)` 呼び出しも `handleZone(...)` に変更する:

```typescript
function handleZone(clientX: number) {
  const overlay = document.getElementById('eh-helper-spread-overlay');
  const width = overlay ? overlay.clientWidth : window.innerWidth;
  const zone = getOverlayClickZone(width > 0 ? clientX / width : 0.5);
  if (zone === 'next') {
    advanceSpread();
  } else if (zone === 'prev') {
    retreatSpread();
  } else {
    const next = !controlsVisible.value;
    controlsVisible.value = next;
    if (!next) menuOpen.value = false;
  }
}
```

`handleClick` を次に置き換える（コントロール要素のクリックは伝播しないので除外チェックは X だけ残す）:

```typescript
function handleClick(event: MouseEvent) {
  if ((event.target as HTMLElement).id === 'eh-helper-spread-close') return;
  event.preventDefault();
  event.stopPropagation();
  handleZone(event.clientX);
}
```

`handleTouchEnd` を次に置き換える:

```typescript
function handleTouchEnd(event: TouchEvent) {
  if ((event.target as HTMLElement).id === 'eh-helper-spread-close') return;
  const touch = event.changedTouches[0];
  if (!touch) return;
  event.preventDefault();
  event.stopPropagation();
  handleZone(touch.clientX);
}
```

- [ ] **Step 4: ホイールハンドラを実装**

`handleClose` 関数の直後に追記する:

```typescript
function handleWheel(event: WheelEvent) {
  event.preventDefault();
  if (Math.abs(event.deltaY) < 1) return;
  const now = Date.now();
  if (now - lastWheelAt < WHEEL_COOLDOWN_MS) return;
  lastWheelAt = now;
  if (event.deltaY > 0) {
    advanceSpread();
  } else {
    retreatSpread();
  }
}
```

- [ ] **Step 5: カーソルヒントを3ゾーン化**

`handleMouseMove` を次に置き換える:

```typescript
function handleMouseMove(event: MouseEvent) {
  const overlay = event.currentTarget as HTMLElement;
  const width = overlay.clientWidth;
  const zone = getOverlayClickZone(width > 0 ? event.clientX / width : 0.5);
  const cls = zone === 'next' ? 'eh-cursor-left' : zone === 'prev' ? 'eh-cursor-right' : '';
  overlay.classList.remove('eh-cursor-left', 'eh-cursor-right');
  if (cls) overlay.classList.add(cls);
}
```

- [ ] **Step 6: オーバーレイ `<div>` に `onWheel` を追加し、X を条件表示にする**

`return (` 内の `<div id="eh-helper-spread-overlay" ...>` の属性に `onWheel={handleWheel}` を追加する:

```tsx
    <div
      id="eh-helper-spread-overlay"
      class={state.single ? 'eh-spread-single' : ''}
      onClick={handleClick}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
    >
```

同 `return` 内の X ボタンを `controlsVisible.value` 時のみ描画するよう変更する。`<button id="eh-helper-spread-close" ...>×</button>` を次に置き換える:

```tsx
{
  controlsVisible.value && (
    <button id="eh-helper-spread-close" onClick={handleClose}>
      ×
    </button>
  );
}
```

- [ ] **Step 7: テスト（純粋関数は Task 1 済み）と型チェック・ビルド**

Run: `npm run typecheck && npm run build`
Expected: 両方ともエラーなしで終了。

- [ ] **Step 8: コミット**

```bash
git add src/content/components/SpreadOverlay.tsx
git commit -m "feat: add wheel navigation and center-tap controls toggle in overlay"
```

---

## Task 5: 下部シークバー（SpreadOverlay.tsx）

**Files:**

- Modify: `src/content/components/SpreadOverlay.tsx`

**Interfaces:**

- Consumes: `controlsVisible`（Task 2）, `virtualPage` / `totalPages`（既存 state）, `seekToPage`（Task 3）, `pageFromSeekFraction` / `seekFractionFromPage`（Task 1）。
- Produces: なし（UI）。

- [ ] **Step 1: state / spread / utils の import を更新**

`import { spreadState, settings, controlsVisible, menuOpen } from '../state.js';` を次に置き換える:

```typescript
import {
  spreadState,
  settings,
  controlsVisible,
  menuOpen,
  virtualPage,
  totalPages
} from '../state.js';
```

spread の import 行（`import { advanceSpread, retreatSpread, exitOverlay, retryImage } from '../spread.js';`）を次に置き換える:

```typescript
import { advanceSpread, retreatSpread, exitOverlay, retryImage, seekToPage } from '../spread.js';
```

Task 4 で追加した `import { getOverlayClickZone } from '../../shared/viewer-utils.js';` を次に置き換える:

```typescript
import {
  getOverlayClickZone,
  pageFromSeekFraction,
  seekFractionFromPage
} from '../../shared/viewer-utils.js';
```

- [ ] **Step 2: シークプレビュー用 signal を追加**

`let lastWheelAt = 0;` の直後に追記する:

```typescript
const seekPreview = signal<number | null>(null);
```

- [ ] **Step 3: シークバーのハンドラを実装**

`handleWheel` 関数の直後に追記する:

```typescript
function pageFromPointer(event: PointerEvent): number {
  const track = document.getElementById('eh-helper-seek-track');
  const total = totalPages.value;
  if (!track || total <= 0) return virtualPage.value || 1;
  const rect = track.getBoundingClientRect();
  const fraction = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
  return pageFromSeekFraction(fraction, total);
}

function handleSeekDown(event: PointerEvent) {
  event.preventDefault();
  event.stopPropagation();
  if (totalPages.value <= 0) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  seekPreview.value = pageFromPointer(event);
}

function handleSeekMove(event: PointerEvent) {
  if (seekPreview.value === null) return;
  event.preventDefault();
  seekPreview.value = pageFromPointer(event);
}

function handleSeekUp(event: PointerEvent) {
  if (seekPreview.value === null) return;
  event.preventDefault();
  event.stopPropagation();
  const target = seekPreview.value;
  seekPreview.value = null;
  seekToPage(target);
}
```

- [ ] **Step 4: シークバー UI を描画**

`return (` 内、X ボタンのブロックの直後（`<img id="eh-helper-spread-left" ... />` の前）に、コントロールバーを追記する:

```tsx
{
  controlsVisible.value && (
    <div id="eh-helper-spread-controls" onClick={(e) => e.stopPropagation()}>
      <div
        id="eh-helper-seek-track"
        class={totalPages.value <= 0 ? 'eh-seek-disabled' : ''}
        onPointerDown={handleSeekDown}
        onPointerMove={handleSeekMove}
        onPointerUp={handleSeekUp}
      >
        <div
          id="eh-helper-seek-fill"
          style={{
            width:
              seekFractionFromPage(seekPreview.value ?? virtualPage.value, totalPages.value) * 100 +
              '%'
          }}
        />
        <div
          id="eh-helper-seek-thumb"
          style={{
            left:
              seekFractionFromPage(seekPreview.value ?? virtualPage.value, totalPages.value) * 100 +
              '%'
          }}
        />
      </div>
      <div id="eh-helper-seek-count">
        {(seekPreview.value ?? virtualPage.value) || 0}
        {' / '}
        {totalPages.value > 0 ? totalPages.value : '-'}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 型チェックとビルド**

Run: `npm run typecheck && npm run build`
Expected: 両方ともエラーなしで終了。

- [ ] **Step 6: コミット**

```bash
git add src/content/components/SpreadOverlay.tsx
git commit -m "feat: add draggable seek bar with page counter to overlay controls"
```

---

## Task 6: ☰ の表示制御（Menu.tsx）と Escape 連携（main.tsx）

**Files:**

- Modify: `src/content/components/Menu.tsx`
- Modify: `src/content/main.tsx`

**Interfaces:**

- Consumes: `controlsVisible`（Task 2）, `spreadState`（既存）, `menuOpen`（既存）。
- Produces: なし。

- [ ] **Step 1: Menu.tsx の import を更新**

`src/content/components/Menu.tsx` の2行目 `import { menuOpen, settings } from '../state.js';` を次に置き換える:

```typescript
import { menuOpen, settings, controlsVisible, spreadState } from '../state.js';
```

- [ ] **Step 2: オーバーレイ中は controlsVisible 時のみ ☰ を表示**

`export function Menu()` 内の `const open = menuOpen.value;` の直後に追記する:

```typescript
const overlayActive = spreadState.value.active;
const hideButton = overlayActive && !controlsVisible.value;
```

`return (` 内の `<button id="eh-helper-menu-btn" ...>☰</button>` ブロックを `{!hideButton && (...)}` で囲う。具体的には:

```tsx
return (
  <>
    {!hideButton && (
      <button
        id="eh-helper-menu-btn"
        type="button"
        class={open ? 'eh-menu-open' : ''}
        aria-label={msg('menuSettingsLabel')}
        onClick={function (e) {
          e.preventDefault();
          e.stopPropagation();
          menuOpen.value = !menuOpen.value;
        }}
      >
        ☰
      </button>
    )}
    {open && <MenuPanel />}
  </>
);
```

- [ ] **Step 3: main.tsx の import に controlsVisible を追加**

`src/content/main.tsx` の2行目 `import { settings, menuOpen, virtualPage } from './state.js';` を次に置き換える:

```typescript
import { settings, menuOpen, virtualPage, controlsVisible } from './state.js';
```

- [ ] **Step 4: Escape のフォールバック順を更新**

`src/content/main.tsx` の `keydown` リスナ内、`if (event.key === 'Escape' && !document.fullscreenElement) { ... }` ブロックを次に置き換える:

```typescript
if (event.key === 'Escape' && !document.fullscreenElement) {
  if (menuOpen.value) {
    event.preventDefault();
    menuOpen.value = false;
    return;
  }
  if (controlsVisible.value && isOverlayActive()) {
    event.preventDefault();
    controlsVisible.value = false;
    return;
  }
  if (isOverlayActive()) {
    event.preventDefault();
    exitOverlay();
  }
}
```

- [ ] **Step 5: 型チェックとビルド**

Run: `npm run typecheck && npm run build`
Expected: 両方ともエラーなしで終了。

- [ ] **Step 6: コミット**

```bash
git add src/content/components/Menu.tsx src/content/main.tsx
git commit -m "feat: gate hamburger button on controls visibility and handle Escape"
```

---

## Task 7: スタイル（content.css）と最終品質ゲート

**Files:**

- Modify: `addon/content/content.css`

**Interfaces:**

- Consumes: Task 4–6 で追加された DOM（`#eh-helper-spread-controls`, `#eh-helper-seek-track`, `#eh-helper-seek-fill`, `#eh-helper-seek-thumb`, `#eh-helper-seek-count`）。
- Produces: なし。

- [ ] **Step 1: コントロールバーのスタイルを追加**

`addon/content/content.css` の `#eh-helper-spread-overlay.eh-spread-single #eh-helper-spread-right { ... }` ブロックの直後（`#eh-helper-menu-btn` の定義の前）に追記する:

```css
#eh-helper-spread-controls {
  pointer-events: auto;
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.75), rgba(0, 0, 0, 0));
  box-sizing: border-box;
}

#eh-helper-seek-track {
  position: relative;
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.25);
  cursor: pointer;
  touch-action: none;
}

#eh-helper-seek-track.eh-seek-disabled {
  opacity: 0.4;
  cursor: default;
}

#eh-helper-seek-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.85);
}

#eh-helper-seek-thumb {
  position: absolute;
  top: 50%;
  width: 16px;
  height: 16px;
  margin-left: -8px;
  border-radius: 50%;
  background: #fff;
  transform: translateY(-50%);
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.6);
}

#eh-helper-seek-count {
  flex: 0 0 auto;
  min-width: 72px;
  text-align: right;
  color: #fff;
  font: 13px/1 sans-serif;
  font-variant-numeric: tabular-nums;
  user-select: none;
}
```

- [ ] **Step 2: モバイル用にタッチターゲットを拡大**

`addon/content/content.css` 末尾のモバイル用メディアクエリ（`@media` ブロック）内の最後に追記する。まず `@media` ブロックの開始・終了行を確認するため、ファイル末尾付近に既存の `@media` があることを前提に、その閉じ括弧 `}` の直前へ次を追記する:

```css
#eh-helper-seek-track {
  height: 10px;
}

#eh-helper-seek-thumb {
  width: 22px;
  height: 22px;
  margin-left: -11px;
}

#eh-helper-spread-controls {
  padding: 20px 16px;
}
```

（注: 既存メディアクエリの正確な開始行は `grep -n "@media" addon/content/content.css` で確認してから挿入すること。複数ある場合は、`#eh-helper-menu-btn` / `#eh-helper-spread-close` のモバイル調整がある最後のブロックに追記する。）

- [ ] **Step 3: 最終品質ゲートを実行**

Run: `npm run check`
Expected: `typecheck → lint → format:check → test → build → addon:lint → addon:build` がすべて成功。

format:check で触っていないファイルが落ちた場合は `npm run format` を実行してから再度 `npm run check`。lint エラーが出た場合は該当箇所を修正（特に未使用 import に注意）。

- [ ] **Step 4: コミット**

```bash
git add addon/content/content.css
git commit -m "feat: style overlay controls bar and seek bar"
```

---

## Task 8: 手動動作確認（任意）とバージョン bump

**Files:**

- 変更なし（確認）→ その後 `package.json` / `addon/manifest.json`（`version:patch` が自動更新）。

**Interfaces:**

- Consumes: 全タスクの成果。
- Produces: patch バージョンのリリース準備。

- [ ] **Step 1: 手動確認チェックリスト（`npm run dev` または拡張を読み込んで実機確認）**

実際の e-hentai.org / exhentai.org のビューアーで以下を確認する:

- オーバーレイを開いた直後は X・☰・シークバーが非表示。
- 中央タップで X・☰・シークバーが表示され、再度中央タップで非表示。
- 左40%タップで次ページ、右40%タップで前ページ。
- ホイール下=次 / 上=前。連続回転で飛びすぎない。背後ページがスクロールしない。
- シークバーをドラッグ/クリックでページジャンプ。見開きモードで見開き単位にスナップ。
- カウンタが「現在 / 総ページ」を表示し、ドラッグ中はプレビュー値を表示。
- ☰ で既存設定パネルが開く。Escape はパネル→コントロール→オーバーレイ終了の順で閉じる。

問題があれば該当 Task に戻って修正・再コミットする。

- [ ] **Step 2: バージョンを patch で上げる**

Run: `npm run version:patch`
Expected: `package.json` と `addon/manifest.json` の version が patch 更新され、変更がコミットされる（`bump-version.mjs` の挙動に従う）。

- [ ] **Step 3: bump がコミットされていなければコミット**

`git status` で確認し、未コミットなら:

```bash
git add package.json addon/manifest.json
git commit -m "chore: bump version to <new-version>"
```

（`bump-version.mjs` が自動コミットする場合は本ステップ不要。`git log --oneline -1` で確認する。）

- [ ] **Step 4: PR 作成（プッシュとレビュー）**

```bash
git push -u origin feat/overlay-controls-seekbar
```

その後 `gh pr create` で PR を作成し、CI を通してからレビュー・マージする。main マージで `sign-addon.yml` により AMO 署名と GitHub Release が走る。

---

## Self-Review

**Spec coverage:**

- ホイール送り（下=次/上=前、クールダウン、preventDefault）→ Task 4 ✓
- 3ゾーンクリック（左40%/中央20%/右40%、中央でコントロール開閉）→ Task 1（判定）+ Task 4（適用）✓
- 没入ビュー（既定非表示・中央タップのみで開閉・自動非表示なし）→ Task 2（signal）+ Task 3（リセット）+ Task 4（トグル）✓
- X を controlsVisible 時のみ表示 → Task 4 ✓
- ☰ をオーバーレイ中は controlsVisible 時のみ表示（既存パネル流用）→ Task 6 ✓
- 下部シークバー（ドラッグ＆クリック、見開きスナップ、preview）→ Task 1（計算）+ Task 3（seekToPage）+ Task 5（UI）✓
- 「現在 / 総ページ」表示・total<=0 の扱い → Task 5 ✓
- Escape の順序（panel→controls→exit）→ Task 6 ✓
- 純粋関数のテスト → Task 1 ✓
- スタイル・モバイル → Task 7 ✓
- patch リリース → Task 8 ✓

**Placeholder scan:** プレースホルダなし。各コードステップに実コードを記載済み。Task 7 Step 2 のメディアクエリ挿入位置のみ `grep` で確認する旨を明記（既存 CSS の行番号がコミット時点で変動しうるため、固定行番号を書かない方針）。

**Type consistency:**

- `getOverlayClickZone(fraction)` / `pageFromSeekFraction(fraction, total)` / `seekFractionFromPage(page, total)` は Task 1 定義と Task 4/5 利用で一致。
- `seekToPage(page: number)` は Task 3 定義、Task 5 利用で一致。
- `controlsVisible`（signal<boolean>）は Task 2 定義、Task 3/4/5/6 利用で一致。
- `seekPreview`（signal<number | null>）は Task 5 内で定義・利用。
- DOM id（`eh-helper-spread-controls` / `eh-helper-seek-track` / `eh-helper-seek-fill` / `eh-helper-seek-thumb` / `eh-helper-seek-count`）は Task 5 と Task 7 で一致。
