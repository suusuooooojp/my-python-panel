# 🐍 PyPanel Ultra (Professional Edition)

- **AI生成コード**: 本ソフトウェアはAIによって生成されています。予期せぬバグや挙動が含まれる可能性があります。商用利用や重要なデータを取り扱う際は、十分な検証を行ってください。

**PyPanel Ultra** は、ブラウザだけで完結して動作する、次世代の統合開発環境（IDE）です。  
サーバーサイドの環境構築は一切不要。WebAssembly技術を駆使し、Python, Java, Go, Ruby などの本格的なプログラミング言語を、お使いのブラウザ上で直接実行・検証できます。

> **🤖 AIによる開発プロジェクト**  
> 本プロジェクトのコード、アーキテクチャ設計、およびこのドキュメントは、**生成AI（Artificial Intelligence）の支援を受けて実装されました。**  
> 「インストール不要」「オフライン動作」「VS Codeのような操作感」といった高度な要件定義に基づき、AIが最適な技術選定（WebAssembly, Monaco Editor, Service Worker等）を行い、コードを生成しています。

---

## ✨ 主な特徴

### 1. 💎 マルチ言語ランタイム (WebAssembly)
バックエンドサーバーを介さず、クライアントサイド（ブラウザ）で以下の言語が動作します。
- **Python**: [Pyodide](https://pyodide.org/) を採用。NumPyやPandasなどのデータ分析ライブラリも利用可能です。
- **Java**: [CheerpJ](https://leaningtech.com/cheerpJ/) 技術により、JVM（Java仮想マシン）をブラウザ上でエミュレートします。
- **Go**: Go言語のWASMビルドを実行可能です。
- **Ruby**: WebAssembly版のCRubyを動作させます。
- **Node.js (Web)**: ES Modules形式で、`npm` パッケージをURLインポートして使用できます。

### 2. 🖥️ プロ仕様のエディタ (Monaco Editor)
VS Codeと同じエンジンである **Monaco Editor** を採用し、妥協のないコーディング環境を提供します。
- **ミニマップ**: コードの全体像を右側に表示し、クリックで高速移動できます。
- **全角スペース検知**: バグの原因になりやすい全角スペース（　）をオレンジ色で可視化します。
- **インテリセンス**: 強力な入力補完とシンタックスハイライトが機能します。

### 3. 🎨 柔軟なレイアウトとUI
- **リサイズ**: エディタとターミナルの境界線をドラッグして、作業しやすい広さに調整可能です。
- **収納機能**: サイドバーやターミナルはダブルクリックやボタン操作で折りたたみ可能です。
- **ポップアッププレビュー**: `Pop` ボタンを押すと、HTML/CSS/JS を統合したWebサイトを別ウィンドウ（オーバーレイ）で確認できます。

### 4. ⚡ 安全性とパフォーマンス
- **ダウンロード警告**: JavaやGoなど、ランタイムサイズが大きい（数MB〜）言語を実行する際は、事前に確認ダイアログを表示し、ユーザーの通信量を保護します。
- **オフライン対応**: PWA (Service Worker) 対応により、一度アクセスすればオフライン環境（機内など）でも開発が可能です。

---

## 🛠️ 技術スタック

本プロジェクトは、以下のモダンWeb技術によって構成されています。

- **Editor Core**: Monaco Editor (VS Code Engine)
- **Runtime**: Pyodide (Python), CheerpJ (Java), Ruby WASM, Go WASM
- **Infrastructure**: Static Hosting (GitHub Pages / Netlify / Vercel)
- **Concurrency**: Web Workers (メインスレッドをブロックしない非同期実行)
- **Storage**: Local Storage (コードの自動保存)

---

## 🚀 インストールとデプロイ

本ツールは静的サイトとして動作するため、ビルドプロセスは不要です。

### 手順
1. **ファイルの準備**  
   以下の4つのファイルをWebサーバーのルートディレクトリに配置します。
   - `index.html`
   - `main.js`
   - `py-worker.js`
   - `sw.js`

2. **GitHub Pagesでの公開例**  
   GitHubリポジトリを作成し、上記ファイルをアップロードして `Settings` > `Pages` から公開設定を行うだけで、すぐに利用可能になります。

---

## 📖 操作ガイド

### 基本操作
- **実行**: `Ctrl + Enter` (Mac: `Cmd + Enter`) または `▶ Run` ボタン。
- **停止**: 無限ループなどで処理が重い場合は `⏹ Stop` ボタンで強制終了できます。
- **保存**: 入力内容は自動的にブラウザに保存されます（`Ctrl + S` で手動保存も可）。

### ファイル操作 (EXPLORER)
- **新規作成**: サイドバーの `+` ボタンをクリックし、拡張子付きでファイル名を入力します（例: `script.py`, `Style.css`）。
- **削除**: ファイル名にカーソルを合わせ、右側の `×` ボタンをクリックします。

### Web開発モード
HTML, CSS, JavaScriptファイルをそれぞれ作成し、`index.html` が存在する状態で `Pop` ボタンを押すと、すべてのファイルがリンクされた状態でプレビューが表示されます。

---


Copyright (c) 2025 PyPanel Ultra Project  
Generated with AI Assistance.
