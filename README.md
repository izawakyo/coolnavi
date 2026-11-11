# CoolNavi (クールナビ)

> **「まだ大丈夫」という我慢を、「今、休もう」という行動にするサービス**

CoolNavi は、炎天下の外出時や熱中症のリスクがある際に、現在地から最も休みやすい涼み場所（冷房・座席・混雑度・距離）を直感的に探し出し、Webブラウザ上の簡易AR（カメラ＋端末コンパス）や地図で迷わず案内するスマートフォン向けWebアプリケーションです。

---

## 🌟 主な機能と特徴

1. **「休みやすさ」独自評価アルゴリズム**
   - 単純な距離の近さだけでなく、「冷房設備」「休憩用の座席」「直射日光を遮る屋内か」「トイレ」「混雑状況」を総合評価。
   - 今の自分が本当に体力を回復できる場所をランキング形式でおすすめします。
2. **Webブラウザ完結の簡易AR案内**
   - スマートフォンのカメラを目的地の方向に向けると、方角（正面・右・左）と残り距離がリアルタイムにAR表示されます。
   - iOS専用技術 (ARKit等) に依存せず、標準の `getUserMedia` と `DeviceOrientation API` のみで動作。
   - カメラ不許可時やPCブラウザでも、2Dレーダー/コンパス画面へ自動フォールバック。
3. **Leaflet + OpenStreetMap 地図案内**
   - 現在地のリアルタイム追跡と、周辺の涼み場所ピン、目的地までのダイレクトラインを表示。
4. **気象・熱中症アラート表示**
   - 現在の気温、最高気温、熱中症警戒アラートと休憩アドバイスを表示。
5. **みんなの利用状況ワンタップ報告**
   - 「座れた」「冷房が効いていた」「混雑していた」「満席だった」をワンタップで共有・反映。
6. **プライバシーと安全性**
   - 位置情報やカメラ映像を外部サーバーへ送信・保存せず、すべてブラウザ内で完結。
7. **iPhone Safari & タッチ操作への徹底最適化**
   - 屋外の強い日差しの下でも見やすいハイコントラストデザイン。
   - 片手で押しやすい大きめの操作ボタン。
   - iOS 13+ の `DeviceOrientationEvent.requestPermission` 対応。

---

## 🛠️ 使用技術

- **フロントエンド**: HTML5, CSS3, JavaScript (ES6+ Vanilla JS / 外部フレームワーク不使用)
- **地図ライブラリ**: [Leaflet](https://leafletjs.com/) (v1.9.4) + [OpenStreetMap](https://www.openstreetmap.org/)
- **位置情報**: Geolocation API (`getCurrentPosition`, `watchPosition`)
- **端末向き・コンパス**: DeviceOrientation API (`deviceorientation`, `webkitCompassHeading`)
- **カメラ・AR**: MediaDevices API (`getUserMedia` - 背面カメラ)
- **フォント**: Google Fonts (Noto Sans JP)
- **開発・公開環境**: Windows PC, VS Code, GitHub, GitHub Pages

---

## 📂 ディレクトリ構成

```text
CoolNavi/
│
├── index.html              # メインHTML (ホーム/検索/地図/AR/モーダル)
│
├── css/
│   └── style.css           # モバイル最適化・高コントラストUIスタイル
│
├── js/
│   ├── app.js              # 全体状態管理・画面遷移・イベント制御
│   ├── location.js         # Geolocation API 管理・デモ位置シミュレータ
│   ├── map.js              # Leaflet 地図描画・マーカー制御
│   ├── places.js           # 施設データ管理・気象データ・利用状況報告
│   ├── recommendation.js   # 距離計算・休みやすさ総合評価ロジック
│   └── ar.js               # カメラ起動・方位計算・AR HUD描画
│
├── data/
│   ├── places.json         # 涼み場所データ (JSON)
│   └── weather.json        # 気象・暑さ指数モックデータ (JSON)
│
├── images/                 # アイコン・画像リソース
│
└── README.md               # 本ドキュメント
```

---

## 🚀 ローカルでの起動・テスト方法 (Windows)

本アプリは `fetch()` によるJSON読み込みやカメラAPI・位置情報APIを使用するため、ローカルWebサーバー環境で開きます。

### 1. VS Code Live Server を使う場合 (推奨)
1. VS Code で本フォルダ (`coolnavi`) を開く。
2. 拡張機能「Live Server」をインストール。
3. `index.html` を右クリックし、「**Open with Live Server**」を選択。
4. ブラウザで `http://127.0.0.1:5500/` が開きます。

### 2. Python SimpleHTTPServer を使う場合
PowerShell またはコマンドプロンプトで以下を実行：
```powershell
python -m http.server 8000
```
ブラウザで `http://localhost:8000/` にアクセスします。

> **💡 テスト・デモ機能**:
> 画面右上の「**デモ位置**」スイッチをONにすると、東京駅周辺を現在地としたシミュレーション状態で動作確認が可能です。GPSが無効なPCブラウザでも、距離計算や地図、おすすめ判定を即座にテストできます。

---

## 🌐 GitHub Pages への公開方法

GitHub Pages（HTTPS環境）にデプロイすることで、iPhoneの実機Safariからカメラや位置情報、コンパス機能をフル活用できます。

1. GitHub で新規リポジトリを作成（例: `coolnavi`）。
2. ローカルのファイルをコミットしてプッシュ：
   ```powershell
   git init
   git add .
   git commit -m "Initial commit: CoolNavi prototype"
   git branch -M main
   git remote add origin https://github.com/<あなたのユーザー名>/coolnavi.git
   git push -u origin main
   ```
3. GitHub のリポジトリページを開き、「**Settings**」タブへ移動。
4. 左サイドバーの「**Pages**」をクリック。
5. **Build and deployment** の **Branch** を `main`、フォルダを `/ (root)` に設定し「**Save**」。
6. 数分待つと、発行された公開URL (`https://<あなたのユーザー名>.github.io/coolnavi/`) でアクセス可能になります。

---

## 📱 iPhone Safari での実機テスト時のポイント

- **HTTPS接続**: GitHub PagesなどのHTTPS URLでアクセスしてください（位置情報やカメラ、端末コンパスAPIはブラウザの仕様上、セキュアなHTTPS環境でのみ動作します）。
- **権限の許可**: 
  - 初回アクセス時に「位置情報の利用」ダイアログが表示されますので「許可」を選択してください。
  - 「ARで案内」ボタンをタップすると、カメラと動作・方向センサの許可ダイアログが表示されますので「許可」を選択してください。

---

## 🔮 今後の追加予定

- [ ] 自治体や環境省が公開する「指定暑熱避難施設（クーリングシェルター）」のリアルタイムオープンデータAPI連携
- [ ] 気象庁/天気予報APIとのリアルタイム気象データ連動
- [ ] 徒歩ルート案内（道路網に沿ったポリラインナビゲーション）
- [ ] 日陰の多いルートの優先検索機能
- [ ] PWA (Progressive Web App) 対応（ホーム画面追加とオフラインキャッシュ）
