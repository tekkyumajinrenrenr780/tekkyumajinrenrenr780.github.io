# 公開済みURL

https://tekkyumajinrenrenr780.github.io/poker-decision-lab/

# iPhoneで使う方法

## 推奨：GitHub Pagesで公開する

この方法なら、iPhoneのホーム画面に追加し、全画面・オフライン対応のWebアプリとして利用できます。

1. GitHubで新しいリポジトリを作る
2. このフォルダの中身をリポジトリ直下へ配置する
3. `main` ブランチへPushする
4. GitHubの `Settings` → `Pages` を開く
5. Sourceを `GitHub Actions` にする
6. Actions完了後のURLをiPhoneのSafariで開く
7. Safariの共有メニュー → `ホーム画面に追加`
8. `Webアプリとして開く` をオンにして追加する

`.github/workflows/pages.yml` は同梱済みです。

静的なGitHub Pagesでは、ゲーム、履歴、ローカル分析が利用できます。
OpenAI APIを使うLLM分析はサーバー処理が必要なので、API部分の別途ホスティングが必要です。

## Macと同じWi-Fiで一時利用する

1. Macで `start_iphone.command` をダブルクリックする
2. MacのIPアドレスを確認する
3. iPhoneのSafariで `http://MacのIPアドレス:8000` を開く

例:

```text
http://192.168.1.25:8000
```

これは簡易確認用です。Macが起動している間だけ利用でき、HTTPSではないためオフラインキャッシュは有効になりません。

## データ

- 成績履歴はiPhone内に保存されます
- SafariのWebサイトデータを削除すると消える場合があります
- 「成績」タブのJSON出力で定期的にバックアップしてください