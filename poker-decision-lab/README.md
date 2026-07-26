公開URL: https://tekkyumajinrenrenr780.github.io/poker-decision-lab/

# Poker Decision Lab

ゲーム形式でポーカーの意思決定を練習し、プレイ傾向を記録・分析するMVPです。

## できること

- キャッシュゲーム／トーナメントのシナリオ学習
- プリフロップ／ポストフロップの意思決定
- 各選択肢の0〜100点評価
- GTO基準とエクスプロイト調整の分離
- 弱点タグを優先する適応型出題
- 平均スコア、連続正解、コンセプト別成績、判断傾向
- 実戦ハンドの手入力レビュー
- 任意でOpenAI APIによる詳細分析
- 履歴のJSON出力

## すぐ使う方法（APIなし）

`index.html` をブラウザで開くだけでも、ゲームとローカル分析が動きます。

ただし、ブラウザの制約でLLM分析は利用できません。

## 推奨の起動方法

macOS / Windowsで、このフォルダをターミナルから開きます。

```bash
python3 server.py
```

ブラウザで以下を開きます。

```text
http://127.0.0.1:8000
```

## LLMコーチを使う

OpenAI APIの利用料金はChatGPT Plusとは別の従量課金です。APIキーはブラウザではなく、ローカルサーバー側の環境変数に置きます。

### 1. 依存パッケージ

```bash
python3 -m pip install -r requirements.txt
```

### 2. APIキー

macOS / Linux:

```bash
export OPENAI_API_KEY='あなたのAPIキー'
export OPENAI_MODEL='gpt-5.5'
python3 server.py
```

Windows PowerShell:

```powershell
$env:OPENAI_API_KEY='あなたのAPIキー'
$env:OPENAI_MODEL='gpt-5.5'
python server.py
```

モデル名は利用可能なモデルに変更できます。

## データ保存

- プレイ履歴と設定はブラウザの `localStorage` に保存されます。
- 「成績」タブからJSONで出力できます。
- ブラウザデータを削除すると履歴も消えるため、必要に応じてJSON出力してください。

## このMVPの限界

- 厳密なGTOソルバーではありません。
- シナリオ評価は教育用に設計したルールと基準値です。
- ハンドレンジの完全なコンボ計算やCFR計算は未実装です。
- LLM分析は説明と仮説形成には有効ですが、正確な混合頻度の代替にはなりません。

## 次の開発候補

1. ハンド履歴の自動インポート
2. 6人テーブルの連続対戦エンジン
3. GTOレンジ表との照合
4. 相手タイプ別AI（Nit / TAG / LAG / Calling Station）
5. トーナメントICM計算
6. 反復学習カリキュラム
7. スマートフォン用PWA

## iPhone対応

この版はPWA対応です。

- iPhoneのセーフエリア対応
- 画面下部のアプリ型ナビゲーション
- Safariの文字入力時の自動ズーム抑制
- ホーム画面用アイコン
- スタンドアロン表示
- Service Workerによる静的画面のオフラインキャッシュ
- アプリ内のホーム画面追加ガイド

公開方法と追加手順は `IPHONE_SETUP.md` を参照してください。