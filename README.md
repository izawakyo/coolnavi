# CoolNavi (クールナビ)

> **「まだ大丈夫」という我慢を、「今、休もう」という行動にするサービス**

CoolNavi は、炎天下の外出時や熱中症のリスクがある際に、現在地から最も休みやすい涼み場所（冷房・座席・混雑度・距離）を直感的に探し出し、**実際の道路網に沿ったターンバイターン歩行者ルート**や**Webブラウザ上の高性能AR案内（カメラ＋空間浮遊ピン＋曲がり角ガイダンス）**で迷わず案内するスマートフォン向けWebアプリケーションです。

---

## 🌟 主な機能と特徴

1. **実際のオープンデータ・API連携**
   - **OpenStreetMap Overpass API**: 現在地周辺（半径約1.2km）の図書館、公民館・コミュニティセンター、区役所・市役所、カフェなどの実際の涼みスポットを動的取得。
   - **Open-Meteo 気象オープンデータ API**: 現在地座標の最新気温・最高気温・湿度を取得し、暑さ指数（推定WBGT）と熱中症警戒アラートを動的算出。
   - **OSRM (Open Source Routing Machine) 歩行者ルーティング**: 実際の道路網に沿った正確な歩行者ルートと曲がり角（ステップ指示）をリアルタイム計算。
2. **高性能「道路沿い」ARナビゲーション (Turn-by-Turn AR)**
   - 単なる直線方向ではなく、**「次の交差点を右折」「道なりに直進」などの実際の道路に沿ったステップ**をカメラ映像上に案内。
   - 目的地や次の交差点が街並みの中に浮かび上がる **3D空間浮遊ピン (AR Floating Pin)** を実装。
   - 交差点に近づくと自動的に次の指示へ進む自動ステップ進行。
   - カメラ不許可時やPCブラウザでは、スタイリッシュな2Dコンパス・レーダー画面へ自動フォールバック。
3. **「休みやすさ」独自総合評価アルゴリズム**
   - 単純な近さだけでなく、「冷房設備」「座席」「直射日光を遮る屋内か」「混雑状況」を総合評価。
   - 詳細画面では評価内訳（近さ 35点、冷房 25点、座席 15点、混雑 10点など）をプログレスバーで可視化。
4. **Leaflet + OpenStreetMap 道路経路地図**
   - 現在地から涼み場所までの実際の道路網に沿った滑らかな青いポリライン（経路）と曲がり角ピンを描画。
5. **みんなの利用状況ワンタップ報告**
   - 「座れた」「冷房が効いていた」「混雑していた」「満席だった」をワンタップ共有。
   - 「満席だった」報告があれば自動的に混雑度が更新され、スコア判定にもリアルタイム反映。
6. **iPhone Safari 徹底最適化 & PWA対応**
   - iOS 13+ の `DeviceOrientationEvent.requestPermission` 対応。
   - Web App Manifest と SVG アプリアイコンを同梱し、ホーム画面に追加可能。
   - 屋外の強い日差しの下でも見やすいハイコントラストデザイン。

---

## 🛠️ 使用技術

- **フロントエンド**: HTML5, CSS3, JavaScript (ES6+ Vanilla JS / 外部フレームワーク不使用)
- **オープンデータ & 公開API**:
  - [OpenStreetMap Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) (周辺施設オープンデータ)
  - [Open-Meteo API](https://open-meteo.com/) (リアルタイム気象オープンデータ)
  - [OSRM (Open Source Routing Machine)](https://project-osrm.org/) (歩行者道路ルーティング)
- **地図ライブラリ**: [Leaflet](https://leafletjs.com/) (v1.9.4) + [OpenStreetMap](https://www.openstreetmap.org/)
- **デバイス機能**:
  - Geolocation API (`getCurrentPosition`, `watchPosition`)
  - DeviceOrientation API (`deviceorientation`, `webkitCompassHeading`, 傾き姿勢検知)
  - MediaDevices API (`getUserMedia` - 背面カメラ)
- **開発・公開環境**: Windows PC, VS Code, GitHub, GitHub Pages

---

## 📂 ディレクトリ構成

```text
CoolNavi/
│
├── index.html              # メインHTML (ホーム/検索/地図/高性能AR/モーダル)
├── manifest.json           # PWA Web App Manifest (ホーム画面追加対応)
│
├── css/
│   └── style.css           # モバイル最適化・高コントラストUI・AR HUDスタイル
│
├── js/
│   ├── recommendation.js   # 距離計算・休みやすさ総合評価・方位角計算
│   ├── location.js         # Geolocation API 管理・デモ位置シミュレータ
│   ├── routing.js          # OSRM 道路沿い歩行者ルーティング & ターンバイターン解析
│   ├── places.js           # OSM Overpass API & Open-Meteo API 連携・利用報告
│   ├── map.js              # Leaflet 地図・道路沿いルートポリライン描画
│   ├── ar.js               # 高性能道路沿いARナビ・空間浮遊ピン・姿勢センサ
│   └── app.js              # 全体状態管理・画面遷移・イベント制御
│
├── data/
│   ├── places.json         # 涼み場所のプリセットJSONデータ (フォールバック用)
│   └── weather.json        # 気象初期データ (フォールバック用)
│
├── images/
│   └── icon.svg            # CoolNavi アプリアイコン (SVG)
│
└── README.md               # 本ドキュメント
```

---

## 🚀 ローカルでの起動・テスト方法 (Windows)

### 1. VS Code Live Server を使う場合 (推奨)
1. VS Code で本フォルダ (`coolnavi`) を開く。
2. `index.html` を右クリックし、「**Open with Live Server**」を選択。
3. ブラウザで `http://127.0.0.1:5500/` が開きます。

### 2. Python 簡易サーバーを使う場合
PowerShellで以下を実行：
```powershell
python -m http.server 8000
```
ブラウザで `http://localhost:8000/` にアクセスします。

> **💡 テスト・デモ機能**:
> - 画面右上の「**デモ位置**」スイッチをONにすると、東京駅周辺を現在地としたシミュレーション状態で動作確認が可能です。
> - 現在地バーの「🌐 検索」ボタンを押すと、いつでも周辺のOpenStreetMap施設データを再取得できます。

---

## 🌐 GitHub Pages への公開方法 (iPhone実機テスト用)

```powershell
git add .
git commit -m "feat: 実際のオープンデータAPI連携と道路沿い高性能ARナビゲーションを実装"
git push -u origin main
```
GitHub リポジトリの **Settings** > **Pages** で Branch を `main` に指定すると、数分後に公開URLでiPhone Safariからアクセス可能になります。
