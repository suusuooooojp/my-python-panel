# 🐍 PyPanel Ultra (Bundler Edition)

**PyPanel Ultra** は、ブラウザ内で複数のファイルを「ひとつのプロジェクト」として統合・実行できるIDEです。

---

## 🔗 連携機能 (Bundler)

このバージョンでは、HTMLファイル内のリンクタグを自動解析し、仮想ファイルシステム内のファイルを結合します。

### 使い方
1. **HTML**: `index.html` を作成。
2. **CSS**: `style.css` を作成し、HTML側に `<link rel="stylesheet" href="style.css">` と記述。
3. **JS**: `script.js` を作成し、HTML側に `<script src="script.js"></script>` と記述。
4. **実行**: どのファイルを開いていても、`▶ Run` を押せばこれらが結合され、完全なWebページとして表示されます。

---

## 📱 スマホ操作

- **リサイズ**: 画面下部の境界線（`•••`）を指でドラッグすると、プレビュー画面の高さを変更できます。
- **タブ切り替え**: 下部エリアの「TERMINAL」「PREVIEW」タブをタップして表示を切り替えます。

---

## 📂 対応言語

- **Python**: `.py` (データ分析ライブラリ対応)
- **Web**: `.html`, `.css`, `.js` (自動結合)
- **Ruby**: `.rb`
- **Node.js**: `.mjs`

---

Copyright (c) 2025 PyPanel Ultra Team
