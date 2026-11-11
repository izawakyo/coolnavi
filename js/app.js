/**
 * app.js - CoolNavi アプリケーション全体制御
 * 
 * 仕様書の要件:
 * - 画面遷移管理 (ホーム / 検索一覧 / 地図 / AR案内 / モーダル)
 * - 気象情報と現在地の取得・バインド
 * - 涼み場所の検索・ソート・詳細表示
 * - 地図とAR画面の連携
 * - ユーザー利用状況報告機能
 */

window.CoolNaviApp = {
  currentTab: 'home', // 'home' | 'list' | 'map' | 'ar'
  currentLocation: null,
  selectedPlace: null,
  placesList: [],
  weatherData: null,
  activeFilter: 'recommend', // 'recommend' | 'distance'
  seatOnlyFilter: false,

  /**
   * アプリの初期化
   */
  async init() {
    this.bindEvents();

    // 1. 気象データと涼み場所データのロード
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

    // 4. 初回位置情報の取得 (非同期)
    this.refreshLocation(false);
  },

  /**
   * イベントリスナーの登録
   */
  bindEvents() {
    // ボトムナビゲーションの切り替え
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        if (tab) {
          this.switchTab(tab);
        }
      });
    });

    // ホーム画面の主要ボタン
    const btnFindPlaces = document.getElementById('btn-find-places');
    if (btnFindPlaces) {
      btnFindPlaces.addEventListener('click', () => {
        this.switchTab('list');
      });
    }

    const btnQuickMap = document.getElementById('btn-quick-map');
    if (btnQuickMap) {
      btnQuickMap.addEventListener('click', () => {
        this.switchTab('map');
      });
    }

    const btnQuickAR = document.getElementById('btn-quick-ar');
    if (btnQuickAR) {
      btnQuickAR.addEventListener('click', () => {
        const topPlace = PlacesManager.getTopRecommendedPlace(this.currentLocation);
        if (topPlace) {
          this.startARForPlace(topPlace.id);
        } else {
          this.switchTab('list');
        }
      });
    }

    // 現在地更新ボタン
    const btnRefreshLocation = document.getElementById('btn-refresh-location');
    if (btnRefreshLocation) {
      btnRefreshLocation.addEventListener('click', () => {
        this.refreshLocation(true);
      });
    }

    // デモ位置モード切り替えスイッチ
    const demoToggle = document.getElementById('demo-location-toggle');
    if (demoToggle) {
      demoToggle.addEventListener('change', (e) => {
        LocationManager.setMockMode(e.target.checked);
        this.refreshLocation(false);
        this.showToast(e.target.checked ? '東京駅周辺のデモ位置に設定しました' : '実際のGPS位置情報に切り替えました');
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

    // 地図の現在地センタリングボタン
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

    // AR終了ボタン
    const btnCloseAR = document.getElementById('btn-close-ar');
    if (btnCloseAR) {
      btnCloseAR.addEventListener('click', () => {
        ARManager.stopAR();
        this.switchTab('home');
      });
    }

    // ARカメラ/コンパス手動切替ボタン
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

    // モーダルの閉じるボタン
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        this.closeAllModals();
      });
    });

    // モーダル背景クリックで閉じる
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.closeAllModals();
        }
      });
    });

    // 状況報告送信ボタン
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
   * 初期データの読み込み
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
      console.error('初期データの読み込みエラー:', err);
    }
  },

  /**
   * 位置情報の更新
   * @param {boolean} showFeedback ユーザー向け通知を出すか
   */
  async refreshLocation(showFeedback = false) {
    const locStatusText = document.getElementById('current-location-status');
    if (locStatusText) {
      locStatusText.textContent = '現在地を取得中...';
    }

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

      // 地図と施設リストを更新
      MapManager.updateCurrentLocation(this.currentLocation, false);
      this.renderAllViews();

      if (showFeedback) {
        this.showToast('現在地を更新しました');
      }
    } catch (error) {
      console.warn('位置情報取得失敗:', error.message);
      if (locStatusText) {
        locStatusText.innerHTML = '⚠️ 位置情報を取得できませんでした。<br><small>デモ位置モードでお試しいただけます</small>';
      }

      // 取得失敗時は安全のため自動的にデモモードを提案または適用
      if (!this.currentLocation) {
        LocationManager.setMockMode(true);
        const demoToggle = document.getElementById('demo-location-toggle');
        if (demoToggle) demoToggle.checked = true;
        this.currentLocation = LocationManager.MOCK_LOCATION;
        MapManager.updateCurrentLocation(this.currentLocation, false);
        this.renderAllViews();
      }

      if (showFeedback) {
        alert(error.message);
      }
    }
  },

  /**
   * 気象情報の表示
   */
  renderWeather(weather) {
    if (!weather) return;

    const tempEl = document.getElementById('weather-temp');
    const maxTempEl = document.getElementById('weather-max-temp');
    const alertEl = document.getElementById('weather-alert-badge');
    const msgEl = document.getElementById('weather-message');

    if (tempEl) tempEl.textContent = `${weather.currentTemp}℃`;
    if (maxTempEl) maxTempEl.textContent = `最高 ${weather.maxTemp}℃`;
    if (alertEl) {
      alertEl.textContent = `⚠️ 熱中症: ${weather.heatStrokeAlert}`;
      if (weather.heatStrokeAlert.includes('厳重') || weather.heatStrokeAlert.includes('危険')) {
        alertEl.className = 'weather-alert danger';
      }
    }
    if (msgEl) msgEl.textContent = weather.message;
  },

  /**
   * 全画面のデータ描画を更新
   */
  renderAllViews() {
    this.renderHomeTopPlace();
    this.renderPlacesList();
    this.renderMapPlaces();
  },

  /**
   * ホーム画面のおすすめカードを描画
   */
  renderHomeTopPlace() {
    const topPlace = PlacesManager.getTopRecommendedPlace(this.currentLocation);
    const cardEl = document.getElementById('home-top-place-card');
    if (!cardEl) return;

    if (!topPlace) {
      cardEl.innerHTML = '<p class="empty-text">涼み場所を検索中...</p>';
      return;
    }

    const evalData = topPlace.evaluation;
    cardEl.innerHTML = `
      <div class="top-place-header">
        <span class="recommend-badge-ribbon">🥇 今一番おすすめ</span>
        <span class="badge ${evalData.badgeClass}">${evalData.rank}</span>
      </div>
      <h3 class="top-place-name">${topPlace.name}</h3>
      <div class="top-place-meta">
        <span class="meta-dist">🚶 <strong>徒歩 約${evalData.walkingMinutes}分</strong> (${evalData.formattedDistance})</span>
        <span class="meta-status">${evalData.primaryReason}</span>
      </div>
      <div class="feature-tags-row">
        ${evalData.tags.map(tag => `<span class="tag-pill">${tag}</span>`).join('')}
      </div>
      <p class="top-place-desc">${topPlace.description}</p>
      ${topPlace.recentReport ? `
        <div class="recent-report-notice">
          💬 直近の状況: <strong>${topPlace.recentReport.label}</strong> (${topPlace.recentReport.timeFormatted})
        </div>
      ` : ''}
      <div class="top-place-actions">
        <button class="btn-primary" onclick="window.CoolNaviApp.startARForPlace(${topPlace.id})">
          🧭 ARで案内
        </button>
        <button class="btn-secondary" onclick="window.CoolNaviApp.showPlaceDetail(${topPlace.id})">
          詳細を見る
        </button>
      </div>
    `;
  },

  /**
   * 涼み場所一覧の描画
   */
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
        <div class="place-card" data-id="${place.id}">
          <div class="place-card-top">
            <span class="place-rank-number">${rankIcon}</span>
            <div class="place-title-wrap">
              <h4 class="place-name">${place.name}</h4>
              <span class="place-badge ${evalData.badgeClass}">${evalData.rank}</span>
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
            <button class="card-btn secondary" onclick="window.CoolNaviApp.showPlaceDetail(${place.id})">
              詳細
            </button>
            <button class="card-btn outline" onclick="window.CoolNaviApp.showOnMap(${place.id})">
              🗺️ 地図
            </button>
            <button class="card-btn primary" onclick="window.CoolNaviApp.startARForPlace(${place.id})">
              🧭 AR案内
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * 地図上のピン描画
   */
  renderMapPlaces() {
    const list = PlacesManager.getEvaluatedPlaces(this.currentLocation, 'recommend');
    MapManager.renderPlaceMarkers(list);
  },

  /**
   * タブ画面切り替え
   * @param {string} tabName 'home' | 'list' | 'map' | 'ar'
   */
  switchTab(tabName) {
    if (this.currentTab === 'ar' && tabName !== 'ar') {
      ARManager.stopAR();
    }

    this.currentTab = tabName;

    // タブコンテンツの表示切り替え
    document.querySelectorAll('.tab-view').forEach(view => {
      view.classList.remove('active');
    });
    const targetView = document.getElementById(`tab-view-${tabName}`);
    if (targetView) {
      targetView.classList.add('active');
    }

    // ナビゲーションバーのアクティブ表示
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.dataset.tab === tabName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // 地図画面に切り替わった場合は表示崩れを防ぐためにリサイズを発火
    if (tabName === 'map') {
      MapManager.invalidateSize();
      if (this.selectedPlace) {
        MapManager.selectDestination(this.selectedPlace, this.currentLocation);
      }
    }
  },

  /**
   * 地図ピンがタップされた時の処理
   */
  onPlaceMarkerClicked(place) {
    this.selectedPlace = place;
    this.showMapPlaceBanner(place);
  },

  /**
   * 地図下部に選択中施設バナーを表示
   */
  showMapPlaceBanner(place) {
    const banner = document.getElementById('map-bottom-banner');
    if (!banner) return;

    const evalData = place.evaluation || calculateRecommendationScore(place, this.currentLocation);

    banner.innerHTML = `
      <div class="map-banner-header">
        <div>
          <h4>${place.name}</h4>
          <span class="meta">徒歩 約${evalData.walkingMinutes}分 (${evalData.formattedDistance})</span>
        </div>
        <button class="banner-close-btn" onclick="document.getElementById('map-bottom-banner').classList.remove('active')">✕</button>
      </div>
      <div class="map-banner-actions">
        <button class="btn-primary" onclick="window.CoolNaviApp.startARForPlace(${place.id})">
          🧭 ARで案内
        </button>
        <button class="btn-secondary" onclick="window.CoolNaviApp.showPlaceDetail(${place.id})">
          詳細
        </button>
      </div>
    `;
    banner.classList.add('active');
  },

  /**
   * 施設を地図上でフォーカス
   */
  showOnMap(placeId) {
    const place = PlacesManager.getPlaceById(placeId);
    if (!place) return;

    this.selectedPlace = place;
    this.switchTab('map');
    MapManager.selectDestination(place, this.currentLocation);
    this.showMapPlaceBanner(place);
  },

  /**
   * 施設詳細モーダルを表示
   */
  showPlaceDetail(placeId) {
    const place = PlacesManager.getPlaceById(placeId);
    if (!place) return;

    this.selectedPlace = place;
    const evalData = calculateRecommendationScore(place, this.currentLocation);
    const reports = PlacesManager.getReportsForPlace(place.id);

    const modalBody = document.getElementById('modal-place-detail-body');
    if (!modalBody) return;

    modalBody.innerHTML = `
      <div class="detail-header">
        <span class="badge ${evalData.badgeClass}">${evalData.rank}</span>
        <h2>${place.name}</h2>
        <div class="detail-distance-badge">
          🚶 徒歩 約<strong>${evalData.walkingMinutes}分</strong> (約${evalData.formattedDistance})
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
          <tr><th>情報更新</th><td>${place.lastUpdated || '最近'}</td></tr>
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
        <button class="btn-primary" onclick="window.CoolNaviApp.startARForPlace(${place.id})">
          🧭 ARで案内
        </button>
        <button class="btn-secondary" onclick="window.CoolNaviApp.showOnMap(${place.id})">
          🗺️ 地図で見る
        </button>
      </div>
    `;

    document.getElementById('modal-place-detail').classList.add('active');
  },

  /**
   * 状況報告モーダルを開く
   */
  openReportModal() {
    if (!this.selectedPlace) return;
    document.getElementById('modal-report-target-name').textContent = this.selectedPlace.name;
    document.getElementById('modal-report').classList.add('active');
  },

  /**
   * 全てのモーダルを閉じる
   */
  closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('active'));
  },

  /**
   * AR案内を開始
   * ※ ユーザーのタップアクション起点で呼び出されるため、iOSのパーミッション要求が通る
   */
  async startARForPlace(placeId) {
    const place = PlacesManager.getPlaceById(placeId);
    if (!place) return;

    this.selectedPlace = place;
    this.closeAllModals();
    this.switchTab('ar');

    const arTargetName = document.getElementById('ar-target-name');
    if (arTargetName) arTargetName.textContent = place.name;

    // 目的地の設定
    ARManager.setDestination(place, this.currentLocation);

    // カメラと向きセンサの起動
    try {
      const result = await ARManager.startAR();
      const container = document.getElementById('ar-container');
      const toggleBtn = document.getElementById('btn-toggle-ar-camera');

      if (!result.camera) {
        // カメラが起動できない場合はレーダーモードへ
        container.classList.add('radar-only-mode');
        if (toggleBtn) toggleBtn.textContent = '📷 カメラを起動';
        this.showToast('カメラ映像なしで方向案内を表示します');
      } else {
        container.classList.remove('radar-only-mode');
        if (toggleBtn) toggleBtn.textContent = '🧭 レーダー画面に切替';
      }
    } catch (e) {
      console.warn('AR起動時の例外:', e);
    }
  },

  /**
   * ARオーバーレイの描画更新
   */
  renderAROverlay(state) {
    const arrowEl = document.getElementById('ar-direction-arrow');
    const distEl = document.getElementById('ar-distance-text');
    const walkEl = document.getElementById('ar-walking-text');
    const guideEl = document.getElementById('ar-guide-message');
    const compassHeadingEl = document.getElementById('ar-compass-heading');
    const radarIndicator = document.getElementById('radar-target-dot');

    if (arrowEl) {
      // 矢印の回転角度 (相対角度でスムーズに回転)
      arrowEl.style.transform = `rotate(${state.relativeAngle}deg)`;
      if (state.isStraight) {
        arrowEl.classList.add('straight-forward');
      } else {
        arrowEl.classList.remove('straight-forward');
      }
    }

    if (distEl) {
      distEl.textContent = `あと ${state.formattedDistance}`;
    }

    if (walkEl) {
      walkEl.textContent = `徒歩 約${state.walkingMinutes}分`;
    }

    if (guideEl) {
      guideEl.textContent = `${state.directionArrow} ${state.directionText}`;
    }

    if (compassHeadingEl) {
      compassHeadingEl.textContent = `端末方位: ${Math.round(state.heading)}° / 目的地: ${Math.round(state.bearing)}°`;
    }

    // 2Dレーダー画面上のドット位置を更新
    if (radarIndicator) {
      const rad = (state.relativeAngle - 90) * (Math.PI / 180);
      const radius = 60; // レーダー円の半径
      const x = Math.cos(rad) * radius;
      const y = Math.sin(rad) * radius;
      radarIndicator.style.transform = `translate(${x}px, ${y}px)`;
    }
  },

  /**
   * 簡単なトースト通知表示
   */
  showToast(message) {
    const existing = document.querySelector('.cool-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'cool-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('visible');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }
};

// DOM読み込み完了時に起動
document.addEventListener('DOMContentLoaded', () => {
  window.CoolNaviApp.init();
});
