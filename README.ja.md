# E-Hentai Helper

E-Hentai / ExHentai の画像ビューアをFirefoxで見やすくするための拡張機能です。

## 主な機能

- メイン画像の上端へ自動スクロール
- 画像を画面の高さ・幅に合わせて表示
- 原寸表示への切り替え
- 次ページを最大3ページ先まで先読み
- 先読み状態と読み込み時間の表示
- ポップアップから設定変更
- ブラウザウィンドウの全画面表示切り替え

## 開発中の読み込み

1. Firefoxで `about:debugging#/runtime/this-firefox` を開く
2. `一時的なアドオンを読み込む...` を選ぶ
3. `addon/manifest.json` を選択する

一時的なアドオンはFirefoxを再起動すると削除されます。常用する場合は署名済みXPIを使ってください。

## ビルド

```bash
npm install
npm run addon:build
```

## バージョン更新

```bash
npm run version:patch
```

GitHub Actionsを設定している場合、`main` へpushするとpatch versionの更新、AMO署名、GitHub Release作成を自動化できます。

## プライバシー

この拡張機能は利用統計や個人情報を収集しません。設定はFirefox内に保存されます。

詳細は [docs/PRIVACY_POLICY.ja.md](docs/PRIVACY_POLICY.ja.md) を参照してください。
