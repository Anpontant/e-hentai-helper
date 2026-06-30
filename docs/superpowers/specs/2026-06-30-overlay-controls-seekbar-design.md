# オーバーレイ操作拡張: ホイール送り・コントロールオーバーレイ・シークバー

- 日付: 2026-06-30
- 種別: 機能追加（patch リリース）
- 対象: オーバーレイ表示（`overlayView` / `spreadView`）時のみ

## 背景・目的

現状のオーバーレイ表示では、画面の左右クリック（左=次ページ / 右=前ページ）と
キーボード矢印でしかページ移動できず、X（閉じる）と ☰（設定）は常時表示されている。
没入感のある閲覧体験と、より直感的なページ操作を提供するため、以下を追加する。

1. ホイールの上下でページ移動
2. 画面中央タップで開く「コントロール用オーバーレイ」（X・☰・下部シークバー）
3. 下部シークバーによるページジャンプと「現在 / 総ページ」表示

新しい設定項目は追加しない（常にオーバーレイ表示中に有効）。状態管理は既存の
`@preact/signals` を踏襲し、新規ライブラリは導入しない。

## 確定した設計判断

- コントロール表示モデル: **没入ビュー（自動非表示なし）**。オーバーレイを開いた
  直後は X・☰・シークバーをすべて隠す。表示のきっかけは**画面中央タップのみ**。
  再度の中央タップ / X / Escape で閉じるまで表示し続ける（タイムアウト自動非表示なし）。
- クリック領域: **左40% = 次ページ / 中央20% = コントロール開閉 / 右40% = 前ページ**
  （左=次 / 右=前 の向きは現状維持）。
- シークバー: **ドラッグ＆トラッククリックでジャンプ**。見開きモードでは見開き単位に
  スナップ。バー右隣に「現在 / 総ページ」を表示。
- シークバーの向きは**右開き（RTL）**に合わせる: バーの**右端 = 1 ページ目**、
  **左端 = 最終ページ**。ポインタ位置からのページ算出は左基準フラクションを反転し
  （`pageFromSeekFraction(1 - leftFraction, total)`）、サムは `left: (1 - frac)`、
  進捗フィルは右アンカー（CSS `right: 0`、`width: frac`）とする。

## アーキテクチャ

### 状態（signals）

`src/content/state.ts` に追加:

- `controlsVisible: Signal<boolean>`（既定 `false`）— コントロールオーバーレイの表示状態。
- シーク中のプレビューは `SpreadOverlay.tsx` 内のモジュールレベル signal
  `seekPreview: Signal<number | null>`（既存の `leftError` / `rightError` と同様の局所 signal）
  で保持する。`null` = 非ドラッグ中。

`virtualPage`（現在ページ）と `totalPages`（総ページ）は既存 signal を参照する。

### 純粋関数（`src/shared/viewer-utils.ts`、テスト対象）

- `getOverlayClickZone(fraction: number): 'next' | 'menu' | 'prev'`
  - `fraction = clientX / width`（0–1）。
  - `fraction < 0.4` → `'next'`、`0.4 <= fraction <= 0.6` → `'menu'`、`> 0.6` → `'prev'`。
- `pageFromSeekFraction(fraction: number, total: number): number`
  - `fraction` を 0–1 にクランプ。`total <= 0` の場合は `1` を返す。
  - `page = clamp(round(fraction * (total - 1)) + 1, 1, total)`。
- `seekFractionFromPage(page: number, total: number): number`
  - `total <= 1` の場合は `0`。それ以外は `clamp((page - 1) / (total - 1), 0, 1)`。

### 定数（`src/shared/constants.ts`）

- `WHEEL_COOLDOWN_MS = 200` — ホイール連続発火のクールダウン。

### ジャンプ処理（`src/content/spread.ts`）

- `export function seekToPage(page: number)` を追加。既存の（非公開）
  `renderSpreadAtPage(page)` をラップするだけ。見開きスナップは
  `renderSpreadAtPage` 内の `resolveSpreadPage` がすでに担う。
- `removeSpreadOverlayState()` 内で `controlsVisible.value = false` と
  `seekPreview.value = null` をリセットする（次回オープン時にクリーンな状態へ）。

## コンポーネント

### `src/content/components/SpreadOverlay.tsx`

オーバーレイ `<div>` に以下を追加・変更する。

- **ホイール** `onWheel`:
  - 常に `event.preventDefault()`（背後ページのスクロール抑止）。
  - `Math.abs(deltaY) < 1` は無視。`Date.now() - lastWheel < WHEEL_COOLDOWN_MS` なら無視。
  - `deltaY > 0` → `advanceSpread()`、`deltaY < 0` → `retreatSpread()`。`lastWheel` 更新。
  - `lastWheel` はモジュールレベル変数。コントロール表示状態に関係なく有効。
- **クリック / タッチ**: 既存 `navigateByX` を `handleZone(clientX)` に置換。
  `getOverlayClickZone(clientX / width)` で分岐:
  - `'next'` → `advanceSpread()`、`'prev'` → `retreatSpread()`
  - `'menu'` → `controlsVisible.value = !controlsVisible.value`。
    閉じる場合は `menuOpen.value = false` も実行。
- **カーソルヒント** `handleMouseMove`: 3ゾーン化。左=`eh-cursor-left`、右=`eh-cursor-right`、
  中央=既存クラスを外して通常ポインタ。
- **コントロール層（`controlsVisible` 時のみ描画）**:
  - X（`#eh-helper-spread-close`、左上）を `controlsVisible` 時のみ表示に変更。
  - 下部シークバー（後述）。
  - これら操作要素は `onClick` で `stopPropagation()` し、ゾーンクリックを発火させない
    （全画面ラッパは使わず、各要素／バーコンテナ単位で停止する。中央以外の背景は
    引き続きゾーンクリック可能）。
  - ☰ は `SpreadOverlay` ではなく `Menu.tsx` 側の既存ボタンを再利用（次節）。

#### シークバー（下部）

- 構造: トラック（`<div>`）＋ 進捗フィル ＋ サム ＋ カウンタ「現在 / 総」。
  向きは RTL（右端 = 1 ページ目）。
- 表示ページ `displayPage = seekPreview.value ?? virtualPage.value`。
  `frac = seekFractionFromPage(displayPage, totalPages.value)`（1 関数呼び出しに集約）。
  フィル = 右アンカーで `width: frac`、サム = `left: (1 - frac)`。
- Pointer Events:
  - `onPointerDown`: `setPointerCapture`、`leftFraction = (clientX - trackLeft) / trackWidth`、
    `seekPreview.value = pageFromSeekFraction(1 - leftFraction, totalPages.value)`（RTL 反転）。
  - `onPointerMove`（ドラッグ中のみ）: `seekPreview` を更新。
  - `onPointerUp`: `seekToPage(seekPreview.value)` を一度だけ実行し、`seekPreview.value = null`。
    （ドラッグ中は画像を読み込まず、確定時のみジャンプ＝負荷軽減）
  - コントロール非表示時（中央タップ / Escape / オーバーレイ終了）に `seekPreview` を
    リアクティブにリセット（ドラッグ中断時の残留を防ぐ）。
- `totalPages <= 0` のとき: トラックは無効（pointer 操作を受け付けない）、カウンタは
  現在ページのみ（総ページは `-`）。
- コントロールバー内のクリック/タッチは `closest('#eh-helper-spread-controls')` でゾーン
  クリックへ伝播させない（タッチ端末でのページ送り誤爆を防止）。

### `src/content/components/Menu.tsx`

- グローバル ☰ ボタン `#eh-helper-menu-btn` の表示条件を変更:
  - オーバーレイ非アクティブ時（`!spreadState.value.active`）: 従来どおり常時表示。
  - オーバーレイアクティブ時: `controlsVisible.value` が `true` のときのみ表示。
- これにより既存の開閉トグル・外側クリック処理・設定パネル（`MenuPanel`）をそのまま流用でき、
  コントロールオーバーレイの ☰ として機能する（位置は従来どおり右上）。

### `src/content/main.tsx`

- `keydown` の Escape 分岐を更新（順序）:
  1. `menuOpen` が開いていれば閉じる。
  2. `controlsVisible` が `true` なら `false` にする（オーバーレイは閉じない）。
  3. それ以外でオーバーレイがアクティブなら `exitOverlay()`。
- 矢印キー（ArrowLeft=advance / ArrowRight=retreat）は現状維持。
- ホイールは `SpreadOverlay` 側で処理するため `main.tsx` には追加しない。

### スタイル（`addon/content/content.css`）

- コントロール層: 下部バーコンテナ（`position: fixed; bottom; left/right`）、トラック、
  フィル、サム、カウンタ。X は既存スタイルを流用しつつ表示制御。
- 中央ゾーン用の通常カーソル。
- 既存のモバイル用メディアクエリに合わせ、シークバーのタッチターゲットを確保。

## データフロー

```
中央タップ → controlsVisible トグル
  → SpreadOverlay が X / シークバー を描画、Menu が ☰ を描画
シークバー操作（down/move）→ seekPreview 更新 → サム/カウンタが追従（画像読込なし）
シークバー pointerup → seekToPage(seekPreview) → renderSpreadAtPage → spreadState 更新 → 画像描画
ホイール（throttled）→ advance/retreat → renderSpreadAtPage → spreadState 更新
exitOverlay / Escape → removeSpreadOverlayState で controlsVisible/seekPreview リセット
```

## エラー処理・エッジケース

- `totalPages <= 0`（総ページ未取得）: シーク無効、カウンタは現在ページのみ。
- 単ページオーバーレイ（`overlayView` のみ）: `advance/retreat` は既存ロジックで1ページ単位、
  シークも `resolveSpreadPage`（`spreadView=false`）でそのままのページに解決される。
- オーバーレイ非アクティブ時: ホイール・中央タップ・シークは一切作用しない。
- ホイール: トラックパッドの連続イベントはクールダウンで1ステップ化。背後スクロールは
  `preventDefault` で抑止。

## テスト

`test/viewer-utils.test.ts`（既存ファイル）に純粋関数の境界値テストを追加:

- `getOverlayClickZone`: `0`, `0.39`, `0.4`, `0.5`, `0.6`, `0.61`, `1` → 期待ゾーン。
- `pageFromSeekFraction`: `total=0`、`fraction` 端点（0/1）、中間値、クランプ。
- `seekFractionFromPage`: `total<=1`、先頭/末尾ページ、中間ページ、クランプ。

UI 操作（pointer / wheel）はロジックを純粋関数へ切り出すことでテスト可能にする。
コンポーネント自体の DOM テストは追加しない（既存方針に合わせる）。

## リリース

実装・`npm run check` 通過後、`npm run version:patch` を独立コミットで実施。
バージョン変更を `main` にマージ／push すると `sign-addon.yml` により AMO 署名と
GitHub Release が作成される。

## スコープ外（YAGNI）

- 新しい設定項目（ホイール感度・コントロール表示の ON/OFF 等）。
- コントロールの自動非表示（タイムアウト）。
- 新規状態管理ライブラリの導入。
