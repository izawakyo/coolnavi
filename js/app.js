/**
 * app.js - CoolNavi アプリケーション全体制御
 * 
 * オープンデータ・道路沿いARナビゲーション統合版
 */

window.CoolNaviApp = {
  currentTab: 'home',
  currentLocation: null,
  selectedPlace: null,
  currentRoute: null,
  placesList: [],
  weatherData: null,
  activeFilter: 'recommend',

  /**
   * アプリ初期化
   */
  async init() {
    this.bindEvents();

    // 1. 初期データロード
    await this.loadInitialData();

    // 2. 地図の初期化
    MapManager.initMap('map-container', (place) => {
      this.onPlaceMarkerClicked(place);
    });

    // 3. ARの初期化
    const arVideo = document.getElementById('ar-video');
    ARManager.init(arVideo, (state) => {
      this.renderAROverlay(state);
    });

    // 4. 初回位置情報取得
    await this.refreshLocation(false);
  },

  /**
   * イベントバインド
   */
  bindEvents() {
    // ボトムナビ
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        if (tab) this.switchTab(tab);
      });
    });

    // ホーム主要ボタン
    const btnFindPlaces = document.getElementById('btn-find-places');
    if (btnFindPlaces) {
      btnFindPlaces.addEventListener('click', () => this.switchTab('list'));
    }

    const btnQuickMap = document.getElementById('btn-quick-map');
    if (btnQuickMap) {
      btnQuickMap.addEventListener('click', () => this.switchTab('map'));
    }

    const btnQuickAR = document.getElementById('btn-quick-ar');
    if (btnQuickAR) {
      btnQuickAR.addEventListener('click', async () => {
        const topPlace = PlacesManager.getTopRecommendedPlace(this.currentLocation);
        if (topPlace) {
          await this.startARForPlace(topPlace.id);
        } else {
          this.switchTab('list');
        }
      });
    }

    // 現在地再取得ボタン
    const btnRefreshLocation = document.getElementById('btn-refresh-location');
    if (btnRefreshLocation) {
      btnRefreshLocation.addEventListener('click', () => this.refreshLocation(true));
    }

    // デモ位置モード切り替え
    const demoToggle = document.getElementById('demo-location-toggle');
    if (demoToggle) {
      demoToggle.addEventListener('change', async (e) => {
        LocationManager.setMockMode(e.target.checked);
        await this.refreshLocation(false);
        this.showToast(e.target.checked ? '東京駅周辺のデモ位置に設定しました' : '実際のGPS位置情報に切り替えました');
      });
    }

    // オープンデータ再検索ボタン
    const btnFetchOpenData = document.getElementById('btn-fetch-opendata');
    if (btnFetchOpenData) {
      btnFetchOpenData.addEventListener('click', async () => {
        if (!this.currentLocation) return;
        this.showToast('周辺のオープンデータスポットを検索中...');
        await PlacesManager.fetchLiveOpenDataPlaces(this.currentLocation.latitude, this.currentLocation.longitude);
        this.renderAllViews();
        this.showToast('オープンデータスポットを更新しました！');
      });
    }

    // 一覧画面のソート切り替え
    const sortRecommendBtn = document.getElementById('sort-recommend-btn');
    const sortDistanceBtn = document.getElementById('sort-distance-btn');
    if (sortRecommendBtn && sortDistanceBtn) {
      sortRecommendBtn.addEventListener('click', () => {
        sortRecommendBtn.classList.add('active');
        sortDistanceBtn.classList.remove('active');
        this.activeFilter = 'recommend';
        this.renderPlacesList();
      });
      sortDistanceBtn.addEventListener('click', () => {
        sortDistanceBtn.classList.add('active');
        sortRecommendBtn.classList.remove('active');
        this.activeFilter = 'distance';
        this.renderPlacesList();
      });
    }

    // 地図現在地センタリング
    const btnMapCenter = document.getElementById('btn-map-center');
    if (btnMapCenter) {
      btnMapCenter.addEventListener('click', () => {
        if (this.currentLocation) {
          MapManager.updateCurrentLocation(this.currentLocation, true);
        } else {
          this.refreshLocation(true);
        }
      });
    }

    // AR終了
    const btnCloseAR = document.getElementById('btn-close-ar');
    if (btnCloseAR) {
      btnCloseAR.addEventListener('click', () => {
        ARManager.stopAR();
        this.switchTab('home');
      });
    }

    // ARカメラ/レーダー切替
    const btnToggleARCamera = document.getElementById('btn-toggle-ar-camera');
    if (btnToggleARCamera) {
      btnToggleARCamera.addEventListener('click', async () => {
        if (ARManager.isCameraActive) {
          ARManager.stopCamera();
          document.getElementById('ar-container').classList.add('radar-only-mode');
          btnToggleARCamera.textContent = '📷 カメラを起動';
        } else {
          try {
            await ARManager.startCamera();
            document.getElementById('ar-container').classList.remove('radar-only-mode');
            btnToggleARCamera.textContent = '🧭 レーダー画面に切替';
          } catch (e) {
            this.showToast('カメラを起動できませんでした');
          }
        }
      });
    }

    // AR道路ナビ / 直線ナビ切替
    const btnToggleARMode = document.getElementById('btn-toggle-ar-mode');
    if (btnToggleARMode) {
      btnToggleARMode.addEventListener('click', () => {
        const newMode = ARManager.toggleNavMode();
        btnToggleARMode.textContent = newMode === 'road' ? '🛣️ 道路ナビ中' : '📍 直線ナビ中';
        this.showToast(newMode === 'road' ? '道路沿いターンバイターン案内に切り替えました' : '直線案内に切り替えました');
      });
    }

    // モーダル閉じる
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => this.closeAllModals());
    });
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeAllModals();
      });
    });

    // 状況報告
    document.querySelectorAll('.report-choice-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const reportType = e.currentTarget.dataset.type;
        if (this.selectedPlace && reportType) {
          PlacesManager.addReport(this.selectedPlace.id, reportType);
          this.showToast('ご報告ありがとうございます！反映しました。');
          this.closeAllModals();
          this.renderAllViews();
        }
      });
    });
  },

  /**
   * 初期データ読み込み
   */
  async loadInitialData() {
    try {
      const [places, weather] = await Promise.all([
        PlacesManager.loadPlaces(),
        PlacesManager.loadWeather()
      ]);
      this.placesList = places;
      this.weatherData = weather;
      this.renderWeather(weather);
      this.renderPlacesList();
    } catch (err) {
      console.error('初期データロードエラー:', err);
    }
  },

  /**
   * 位置情報更新 & オープンデータ連動
   */
  async refreshLocation(showFeedback = false) {
    const locStatusText = document.getElementById('current-location-status');
    if (locStatusText) locStatusText.textContent = '現在地を取得中...';

    try {
      const position = await LocationManager.getCurrentPosition();
      this.currentLocation = position;

      if (locStatusText) {
        if (position.isMock) {
          locStatusText.innerHTML = '📍 <strong>東京駅周辺</strong> (デモ位置)';
        } else {
          locStatusText.innerHTML = `📍 <strong>現在地取得完了</strong> (誤差 ±${Math.round(position.accuracy)}m)`;
        }
      }

      MapManager.updateCurrentLocation(this.currentLocation, false);

      // リアルタイム気象オープンデータと施設オープンデータの非同期取得
      this.fetchOpenDataAsync(position.latitude, position.longitude);

      this.renderAllViews();
      if (showFeedback) this.showToast('現在地を更新しました');
    } catch (error) {
      console.warn('位置情報取得失敗:', error.message);
      if (!this.currentLocation) {
        LocationManager.setMockMode(true);
        const demoToggle = document.getElementById('demo-location-toggle');
        if (demoToggle) demoToggle.checked = true;
        this.currentLocation = LocationManager.MOCK_LOCATION;
        MapManager.updateCurrentLocation(this.currentLocation, false);
        this.renderAllViews();
      }
      if (showFeedback) alert(error.message);
    }
  },

  /**
   * バックグラウンドで実際のオープンデータを取得
   */
  async fetchOpenDataAsync(lat, lon) {
    try {
      // 1. リアルタイム気象
      const liveWeather = await PlacesManager.fetchLiveWeather(lat, lon);
      this.weatherData = liveWeather;
      this.renderWeather(liveWeather);

      // 2. 周辺オープンデータスポット
      const updatedPlaces = await PlacesManager.fetchLiveOpenDataPlaces(lat, lon);
      this.placesList = updatedPlaces;
      this.renderAllViews();

      // オープンデータバッジ表示
      const badge = document.getElementById('opendata-live-badge');
      if (badge && PlacesManager.isLiveOpenDataActive) {
        badge.classList.add('active');
        badge.textContent = '🌐 オープンデータ連動中';
      }
    } catch (e) {
      console.warn('オープンデータ連携エラー:', e);
    }
  },

  /**
   * 気象情報の描画
   */
  renderWeather(weather) {
    if (!weather) return;
    const tempEl = document.getElementById('weather-temp');
    const maxTempEl = document.getElementById('weather-max-temp');
    const alertEl = document.getElementById('weather-alert-badge');
    const msgEl = document.getElementById('weather-message');
    const sourceEl = document.getElementById('weather-source-badge');

    if (tempEl) tempEl.textContent = `${weather.currentTemp}℃`;
    if (maxTempEl) maxTempEl.textContent = `最高 ${weather.maxTemp}℃ (湿度 ${weather.humidity || 65}%)`;
    if (alertEl) {
      alertEl.textContent = `⚠️ 熱中症: ${weather.heatStrokeAlert}`;
      alertEl.className = weather.heatStrokeAlert.includes('危険') ? 'weather-alert danger-high' :
                          weather.heatStrokeAlert.includes('厳重') ? 'weather-alert danger' : 'weather-alert';
    }
    if (msgEl) msgEl.textContent = weather.message;
    if (sourceEl && weather.isLive) {
      sourceEl.textContent = '気象オープンデータ (Live)';
      sourceEl.style.display = 'inline-block';
    }
  },

  renderAllViews() {
    this.renderHomeTopPlace();
    this.renderPlacesList();
    this.renderMapPlaces();
  },

  renderHomeTopPlace() {
    const topPlace = PlacesManager.getTopRecommendedPlace(this.currentLocation);
    const cardEl = document.getElementById('home-top-place-card');
    if (!cardEl) return;

    if (!topPlace) {
      cardEl.innerHTML = '<p class="empty-text">涼み場所を計算中...</p>';
      return;
    }

    const evalData = topPlace.evaluation;
    cardEl.innerHTML = `
      <div class="top-place-header">
        <span class="recommend-badge-ribbon">🥇 今一番休みやすい</span>
        <span class="badge ${evalData.badgeClass}">${evalData.rank}</span>
      </div>
      <h3 class="top-place-name">${topPlace.name}</h3>
      <div class="top-place-meta">
        <span class="meta-dist">🚶 <strong>徒歩 約${evalData.walkingMinutes}分</strong> (${evalData.formattedDistance})</span>
        <span class="meta-status">${evalData.primaryReason}</span>
      </div>
      <div class="feature-tags-row">
        ${evalData.tags.map(tag => `<span class="tag-pill">${tag}</span>`).join('')}
        ${topPlace.isOpenDataLive ? '<span class="tag-pill opendata">🌐 オープンデータ</span>' : ''}
      </div>
      <p class="top-place-desc">${topPlace.description}</p>
      ${topPlace.recentReport ? `
        <div class="recent-report-notice">
          💬 直近の状況: <strong>${topPlace.recentReport.label}</strong> (${topPlace.recentReport.timeFormatted})
        </div>
      ` : ''}
      <div class="top-place-actions">
        <button class="btn-primary" onclick="window.CoolNaviApp.startARForPlace('${topPlace.id}')">
          🧭 道路沿いARで案内
        </button>
        <button class="btn-secondary" onclick="window.CoolNaviApp.showPlaceDetail('${topPlace.id}')">
          詳細・評価内訳
        </button>
      </div>
    `;
  },

  renderPlacesList() {
    const listEl = document.getElementById('places-list-container');
    if (!listEl) return;

    const evaluatedList = PlacesManager.getEvaluatedPlaces(this.currentLocation, this.activeFilter);

    if (evaluatedList.length === 0) {
      listEl.innerHTML = '<div class="empty-list">涼み場所が見つかりませんでした。</div>';
      return;
    }

    listEl.innerHTML = evaluatedList.map((place, index) => {
      const evalData = place.evaluation;
      const rankNumber = index + 1;
      const rankIcon = rankNumber === 1 ? '🥇' : rankNumber === 2 ? '🥈' : rankNumber === 3 ? '🥉' : `${rankNumber}.`;

      return `
        <div class="place-card ${place.isOpenDataLive ? 'card-opendata' : ''}" data-id="${place.id}">
          <div class="place-card-top">
            <span class="place-rank-number">${rankIcon}</span>
            <div class="place-title-wrap">
              <h4 class="place-name">${place.name}</h4>
              <div class="place-sub-badges">
                <span class="place-badge ${evalData.badgeClass}">${evalData.rank}</span>
                ${place.isOpenDataLive ? '<span class="opendata-mini-badge">OSM</span>' : ''}
              </div>
            </div>
          </div>
          <div class="place-distance-bar">
            <span class="place-dist-val">徒歩 <strong>約${evalData.walkingMinutes}分</strong></span>
            <span class="place-dist-meters">約${evalData.formattedDistance}</span>
            <span class="place-crowd-tag crowd-${place.crowdLevel}">
              ${place.crowdLevel === 'low' ? '🟢 空いていそう' : place.crowdLevel === 'medium' ? '🟡 適度な混雑' : '🔴 混雑気味'}
            </span>
          </div>
          <div class="feature-tags-row">
            ${place.airConditioner ? '<span class="tag-pill">❄️ 冷房あり</span>' : ''}
            ${place.seat ? '<span class="tag-pill">🪑 座席あり</span>' : ''}
            ${place.toilet ? '<span class="tag-pill">🚻 トイレあり</span>' : ''}
            ${place.indoor ? '<span class="tag-pill">🏢 屋内</span>' : ''}
          </div>
          ${place.recentReport ? `
            <div class="recent-report-notice compact">
              💬 直近の状況: <strong>${place.recentReport.label}</strong>
            </div>
          ` : ''}
          <div class="place-card-actions">
            <button class="card-btn secondary" onclick="window.CoolNaviApp.showPlaceDetail('${place.id}')">
              詳細
            </button>
            <button class="card-btn outline" onclick="window.CoolNaviApp.showOnMap('${place.id}')">
              🗺️ 経路地図
            </button>
            <button class="card-btn primary" onclick="window.CoolNaviApp.startARForPlace('${place.id}')">
              🧭 AR案内
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  renderMapPlaces() {
    const list = PlacesManager.getEvaluatedPlaces(this.currentLocation, 'recommend');
    MapManager.renderPlaceMarkers(list);
  },

  switchTab(tabName) {
    if (this.currentTab === 'ar' && tabName !== 'ar') {
      ARManager.stopAR();
    }

    this.currentTab = tabName;

    document.querySelectorAll('.tab-view').forEach(view => view.classList.remove('active'));
    const targetView = document.getElementById(`tab-view-${tabName}`);
    if (targetView) targetView.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.dataset.tab === tabName) item.classList.add('active');
      else item.classList.remove('active');
    });

    if (tabName === 'map') {
      MapManager.invalidateSize();
      if (this.selectedPlace) {
        this.loadAndDrawRoute(this.selectedPlace);
      }
    }
  },

  async onPlaceMarkerClicked(place) {
    this.selectedPlace = place;
    this.showMapPlaceBanner(place);
    await this.loadAndDrawRoute(place);
  },

  /**
   * 道路沿いルートを取得して地図に描画
   */
  async loadAndDrawRoute(place) {
    if (!this.currentLocation || !place) return;
    try {
      const route = await RoutingManager.getWalkingRoute(
        this.currentLocation.latitude,
        this.currentLocation.longitude,
        place.latitude,
        place.longitude
      );
      this.currentRoute = route;
      MapManager.drawRoadRoute(route, true);
    } catch (e) {
      console.warn('道路ルート取得エラー:', e);
    }
  },

  showMapPlaceBanner(place) {
    const banner = document.getElementById('map-bottom-banner');
    if (!banner) return;

    const evalData = place.evaluation || calculateRecommendationScore(place, this.currentLocation);

    banner.innerHTML = `
      <div class="map-banner-header">
        <div>
          <h4>${place.name}</h4>
          <span class="meta">🚶 道路沿い歩行 約${evalData.walkingMinutes}分 (${evalData.formattedDistance})</span>
        </div>
        <button class="banner-close-btn" onclick="document.getElementById('map-bottom-banner').classList.remove('active')">✕</button>
      </div>
      <div class="map-banner-actions">
        <button class="btn-primary" onclick="window.CoolNaviApp.startARForPlace('${place.id}')">
          🧭 道路沿いAR案内
        </button>
        <button class="btn-secondary" onclick="window.CoolNaviApp.showPlaceDetail('${place.id}')">
          詳細
        </button>
      </div>
    `;
    banner.classList.add('active');
  },

  async selectPlaceFromMap(placeId) {
    const place = PlacesManager.getPlaceById(placeId);
    if (!place) return;
    this.selectedPlace = place;
    this.showMapPlaceBanner(place);
    await this.loadAndDrawRoute(place);
  },

  async showOnMap(placeId) {
    const place = PlacesManager.getPlaceById(placeId);
    if (!place) return;
    this.selectedPlace = place;
    this.switchTab('map');
    MapManager.selectDestination(place);
    this.showMapPlaceBanner(place);
    await this.loadAndDrawRoute(place);
  },

  /**
   * 施設詳細モーダル表示 (スコア内訳バー付き)
   */
  showPlaceDetail(placeId) {
    const place = PlacesManager.getPlaceById(placeId);
    if (!place) return;

    this.selectedPlace = place;
    const evalData = calculateRecommendationScore(place, this.currentLocation);
    const reports = PlacesManager.getReportsForPlace(place.id);

    const modalBody = document.getElementById('modal-place-detail-body');
    if (!modalBody) return;

    // スコア内訳の計算
    const distScore = evalData.distance <= 100 ? 35 : evalData.distance <= 300 ? 30 : evalData.distance <= 600 ? 24 : evalData.distance <= 1000 ? 15 : 8;
    const acScore = place.airConditioner ? 25 : 0;
    const seatScore = place.seat ? 15 : 0;
    const crowdScore = place.crowdLevel === 'low' ? 10 : place.crowdLevel === 'medium' ? 5 : 0;

    modalBody.innerHTML = `
      <div class="detail-header">
        <span class="badge ${evalData.badgeClass}">${evalData.rank} (スコア: ${evalData.score}点)</span>
        <h2>${place.name}</h2>
        <div class="detail-distance-badge">
          🚶 徒歩 約<strong>${evalData.walkingMinutes}分</strong> (約${evalData.formattedDistance})
        </div>
      </div>

      <!-- 休みやすさ評価スコアの内訳 -->
      <div class="detail-section score-breakdown-section">
        <h4>📊 休みやすさの評価内訳</h4>
        <div class="score-bars">
          <div class="score-bar-row">
            <span class="bar-label">近さ (${distScore}/35点)</span>
            <div class="bar-track"><div class="bar-fill" style="width: ${(distScore/35)*100}%;"></div></div>
          </div>
          <div class="score-bar-row">
            <span class="bar-label">冷房 (${acScore}/25点)</span>
            <div class="bar-track"><div class="bar-fill ac" style="width: ${(acScore/25)*100}%;"></div></div>
          </div>
          <div class="score-bar-row">
            <span class="bar-label">座席 (${seatScore}/15点)</span>
            <div class="bar-track"><div class="bar-fill seat" style="width: ${(seatScore/15)*100}%;"></div></div>
          </div>
          <div class="score-bar-row">
            <span class="bar-label">混雑度 (${crowdScore}/10点)</span>
            <div class="bar-track"><div class="bar-fill crowd" style="width: ${(crowdScore/10)*100}%;"></div></div>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h4>🏢 施設設備</h4>
        <div class="detail-grid">
          <div class="grid-item ${place.airConditioner ? 'checked' : 'cross'}">
            ${place.airConditioner ? '✅' : '❌'} 冷房設備
          </div>
          <div class="grid-item ${place.seat ? 'checked' : 'cross'}">
            ${place.seat ? '✅' : '❌'} 休憩座席
          </div>
          <div class="grid-item ${place.indoor ? 'checked' : 'cross'}">
            ${place.indoor ? '✅' : '❌'} 屋内施設
          </div>
          <div class="grid-item ${place.toilet ? 'checked' : 'cross'}">
            ${place.toilet ? '✅' : '❌'} トイレ完備
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h4>ℹ️ 基本情報</h4>
        <table class="detail-info-table">
          <tr><th>住所</th><td>${place.address}</td></tr>
          <tr><th>営業時間</th><td>${place.openingHours}</td></tr>
          <tr><th>混雑傾向</th><td>${place.crowdLevel === 'low' ? '空いている' : place.crowdLevel === 'medium' ? '普通' : '混雑'}</td></tr>
          <tr><th>情報ソース</th><td>${place.isOpenDataLive ? 'OpenStreetMap オープンデータ' : 'プリセット避難施設'}</td></tr>
        </table>
        <p class="detail-desc-text">${place.description}</p>
      </div>

      <div class="detail-section">
        <div class="report-header-flex">
          <h4>💬 利用者の状況報告</h4>
          <button class="btn-sm-report" onclick="window.CoolNaviApp.openReportModal()">
            ＋ 状況を報告する
          </button>
        </div>
        ${reports.length > 0 ? `
          <div class="reports-mini-list">
            ${reports.map(r => `
              <div class="report-pill-item">
                <span class="report-tag">${r.label}</span>
                <span class="report-time">${r.timeFormatted || '最近'}</span>
              </div>
            `).join('')}
          </div>
        ` : `
          <p class="empty-reports-text">まだ報告がありません。利用した状況を投稿してみましょう！</p>
        `}
      </div>

      <div class="detail-actions-fixed">
        <button class="btn-primary" onclick="window.CoolNaviApp.startARForPlace('${place.id}')">
          🧭 道路沿いAR案内
        </button>
        <button class="btn-secondary" onclick="window.CoolNaviApp.showOnMap('${place.id}')">
          🗺️ 経路地図
        </button>
      </div>
    `;

    document.getElementById('modal-place-detail').classList.add('active');
  },

  openReportModal() {
    if (!this.selectedPlace) return;
    document.getElementById('modal-report-target-name').textContent = this.selectedPlace.name;
    document.getElementById('modal-report').classList.add('active');
  },

  closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('active'));
  },

  /**
   * 高性能道路沿いAR案内の開始
   */
  async startARForPlace(placeId) {
    const place = PlacesManager.getPlaceById(placeId);
    if (!place) return;

    this.selectedPlace = place;
    this.closeAllModals();
    this.switchTab('ar');

    const arTargetName = document.getElementById('ar-target-name');
    if (arTargetName) arTargetName.textContent = place.name;

    // 道路ルートの取得
    let route = this.currentRoute;
    if (!route || route.isRoadNetwork === false) {
      try {
        route = await RoutingManager.getWalkingRoute(
          this.currentLocation.latitude,
          this.currentLocation.longitude,
          place.latitude,
          place.longitude
        );
        this.currentRoute = route;
      } catch (e) {
        console.warn('AR用ルート取得エラー:', e);
      }
    }

    // ARセッションに目的地とルートを設定
    ARManager.setNavigation(place, this.currentLocation, route);

    try {
      const result = await ARManager.startAR();
      const container = document.getElementById('ar-container');
      const toggleBtn = document.getElementById('btn-toggle-ar-camera');

      if (!result.camera) {
        container.classList.add('radar-only-mode');
        if (toggleBtn) toggleBtn.textContent = '📷 カメラを起動';
        this.showToast('カメラ映像なしで道路方向案内を表示します');
      } else {
        container.classList.remove('radar-only-mode');
        if (toggleBtn) toggleBtn.textContent = '🧭 レーダー画面に切替';
      }
    } catch (e) {
      console.warn('AR起動例外:', e);
    }
  },

  /**
   * ARオーバーレイの描画更新 (ターンバイターン指示 & 3D浮遊ピン)
   */
  renderAROverlay(state) {
    const arrowEl = document.getElementById('ar-direction-arrow');
    const distEl = document.getElementById('ar-distance-text');
    const walkEl = document.getElementById('ar-walking-text');
    const guideEl = document.getElementById('ar-guide-message');
    const compassHeadingEl = document.getElementById('ar-compass-heading');
    const radarIndicator = document.getElementById('radar-target-dot');

    // ターンバイターン道路指示カード要素
    const turnCard = document.getElementById('ar-turn-card');
    const turnIconEl = document.getElementById('ar-turn-icon');
    const turnTextEl = document.getElementById('ar-turn-instruction');
    const turnStepEl = document.getElementById('ar-turn-step-count');

    // 3D空間浮遊ピン
    const floatingPin = document.getElementById('ar-floating-pin');

    // 1. 中央矢印の回転
    if (arrowEl) {
      arrowEl.style.transform = `rotate(${state.relativeAngle}deg)`;
      if (state.isStraight) {
        arrowEl.classList.add('straight-forward');
      } else {
        arrowEl.classList.remove('straight-forward');
      }
    }

    // 2. ターンバイターン指示の更新
    if (turnCard && state.currentStepInfo) {
      turnCard.style.display = 'flex';
      if (turnIconEl) turnIconEl.textContent = state.turnIcon;
      if (turnTextEl) turnTextEl.textContent = state.stepInstruction;
      if (turnStepEl) {
        turnStepEl.textContent = `交差点 ${state.currentStepInfo.stepIndex + 1} / ${state.currentStepInfo.totalSteps}`;
      }
    }

    // 3. 3D空間浮遊ピンのスクリーン投影
    if (floatingPin) {
      if (state.isVisibleInScreen && state.isCameraActive) {
        floatingPin.style.display = 'flex';
        floatingPin.style.transform = `translate(${state.screenXPercent * 3.5}px, ${state.screenYPercent * 2}px)`;
        const pinTitle = floatingPin.querySelector('.pin-title');
        const pinDist = floatingPin.querySelector('.pin-dist');
        if (pinTitle) pinTitle.textContent = state.destination.name;
        if (pinDist) pinDist.textContent = `あと ${state.formattedFinalDistance}`;
      } else {
        floatingPin.style.display = 'none';
      }
    }

    // 4. 下部距離情報
    if (distEl) {
      distEl.textContent = `あと ${state.formattedFinalDistance}`;
    }
    if (walkEl) {
      walkEl.textContent = `徒歩 約${state.walkingMinutes}分 (道路沿い)`;
    }
    if (guideEl) {
      guideEl.textContent = `${state.turnIcon} ${state.directionText}`;
    }
    if (compassHeadingEl) {
      compassHeadingEl.textContent = `端末方位: ${Math.round(state.heading)}° / 道路交差点: ${Math.round(state.targetBearing)}°`;
    }

    // 5. 2Dレーダー指示
    if (radarIndicator) {
      const rad = (state.relativeAngle - 90) * (Math.PI / 180);
      const radius = 60;
      const x = Math.cos(rad) * radius;
      const y = Math.sin(rad) * radius;
      radarIndicator.style.transform = `translate(${x}px, ${y}px)`;
    }
  },

  showToast(message) {
    const existing = document.querySelector('.cool-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'cool-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('visible'), 10);
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  window.CoolNaviApp.init();
});
