/**
 * app.js - CoolNavi アプリケーション全体制御
 * 
 * 完全現在地連動オープンデータ検索版:
 * - places.json は一切使用しません
 * - 端末のGPSから取得した本物の現在地周辺のみを検索・表示
 * - 偽データや東京駅のフォールバックを排除
 */

window.CoolNaviApp = {
  currentTab: 'home',
  currentLocation: null,
  selectedPlace: null,
  currentRoute: null,
  weatherData: null,
  activeFilter: 'recommend',

  async init() {
    this.bindEvents();

    // 1. 地図の初期化
    MapManager.initMap('map-container', (place) => {
      this.onPlaceMarkerClicked(place);
    });

    // 2. ARの初期化
    const arVideo = document.getElementById('ar-video');
    ARManager.init(arVideo, (state) => {
      this.renderAROverlay(state);
    });

    // 3. 現在地(GPS)を取得して即座に周辺施設を検索
    await this.refreshLocation(false);
  },

  bindEvents() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        if (tab) this.switchTab(tab);
      });
    });

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

    const btnRefreshLocation = document.getElementById('btn-refresh-location');
    if (btnRefreshLocation) {
      btnRefreshLocation.addEventListener('click', () => this.refreshLocation(true));
    }

    const btnFetchOpenData = document.getElementById('btn-fetch-opendata');
    if (btnFetchOpenData) {
      btnFetchOpenData.addEventListener('click', async () => {
        if (!this.currentLocation) {
          this.refreshLocation(true);
          return;
        }
        this.showToast('現在地周辺のクーリングシェルターを再検索中...');
        await PlacesManager.fetchPlacesByLocation(this.currentLocation.latitude, this.currentLocation.longitude);
        this.renderAllViews();
        this.showToast('周辺の避難所を更新しました！');
      });
    }

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

    const btnCloseAR = document.getElementById('btn-close-ar');
    if (btnCloseAR) {
      btnCloseAR.addEventListener('click', () => {
        ARManager.stopAR();
        this.switchTab('home');
      });
    }

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

    const btnToggleARMode = document.getElementById('btn-toggle-ar-mode');
    if (btnToggleARMode) {
      btnToggleARMode.addEventListener('click', () => {
        const newMode = ARManager.toggleNavMode();
        btnToggleARMode.textContent = newMode === 'road' ? '🛣️ 道路ナビ中' : '📍 直線ナビ中';
        this.showToast(newMode === 'road' ? '道路沿い交差点案内に切り替えました' : '直線案内に切り替えました');
      });
    }

    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => this.closeAllModals());
    });
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeAllModals();
      });
    });

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
   * 現在地(GPS)を取得し、その緯度経度からリアルタイムに周辺避難施設を検索
   */
  async refreshLocation(showFeedback = false) {
    const locStatusText = document.getElementById('current-location-status');
    const homeCard = document.getElementById('home-top-place-card');
    const listContainer = document.getElementById('places-list-container');

    if (locStatusText) locStatusText.innerHTML = '📍 <strong>GPSで現在地を取得中...</strong>';
    if (homeCard) {
      homeCard.innerHTML = `
        <div class="loading-spinner-wrap">
          <div class="spinner"></div>
          <p>あなたの現在地周辺のクーリングシェルターを検索中...</p>
        </div>
      `;
    }

    try {
      // 端末のリアルな現在地GPSを取得
      const position = await LocationManager.getCurrentPosition();
      this.currentLocation = position;

      if (locStatusText) {
        locStatusText.innerHTML = `📍 <strong>現在地取得完了</strong> (精度 ±${Math.round(position.accuracy)}m)`;
      }

      // 地図の中心を現在地に移動
      MapManager.updateCurrentLocation(this.currentLocation, true);

      // 現在地の座標周辺の避難施設と気象データをフェッチ
      await Promise.all([
        PlacesManager.fetchLiveWeather(position.latitude, position.longitude),
        PlacesManager.fetchPlacesByLocation(position.latitude, position.longitude)
      ]);

      this.weatherData = PlacesManager.weather;
      this.renderWeather(this.weatherData);
      this.renderAllViews();

      if (showFeedback) this.showToast('現在地周辺のクーリングシェルターを更新しました');
    } catch (error) {
      console.warn('現在地取得失敗:', error.message);
      if (locStatusText) {
        locStatusText.innerHTML = `⚠️ <strong>位置情報が必要です</strong><br><small>ブラウザで位置情報を許可して更新ボタンを押してください</small>`;
      }
      if (homeCard) {
        homeCard.innerHTML = `
          <div class="empty-list" style="padding: 20px; text-align: center;">
            <p style="font-weight: 700; color: #B91C1C;">⚠️ 位置情報が許可されていません</p>
            <p style="font-size: 0.8rem; color: #64748B; margin-top: 6px;">あなたの近くのクーリングシェルターを探すには、位置情報（GPS）の利用を許可してください。</p>
            <button class="btn-primary" style="margin: 14px auto 0; width: auto; padding: 8px 18px;" onclick="window.CoolNaviApp.refreshLocation(true)">
              🔄 再度位置情報を許可して探す
            </button>
          </div>
        `;
      }
      if (showFeedback) alert(error.message);
    }
  },

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
      cardEl.innerHTML = '<p class="empty-text">現在地周辺のクーリングシェルターを検索中...</p>';
      return;
    }

    const evalData = topPlace.evaluation;
    cardEl.innerHTML = `
      <div class="top-place-header">
        <span class="recommend-badge-ribbon">🏛️ あなたの現在地から一番近い避難所</span>
        <span class="badge ${evalData.badgeClass}">${evalData.rank}</span>
      </div>
      <h3 class="top-place-name">${topPlace.name}</h3>
      <div class="top-place-meta">
        <span class="meta-dist">🚶 <strong>徒歩 約${evalData.walkingMinutes}分</strong> (${evalData.formattedDistance})</span>
        <span class="meta-status">定員: 約${topPlace.capacity || 50}名</span>
      </div>
      <div class="feature-tags-row">
        ${evalData.tags.map(tag => `<span class="tag-pill">${tag}</span>`).join('')}
        ${topPlace.waterDispenser ? '<span class="tag-pill water">💧 給水可</span>' : ''}
      </div>
      <p class="top-place-desc">${topPlace.description}</p>
      ${topPlace.recentReport ? `
        <div class="recent-report-notice">
          💬 直近の状況報告: <strong>${topPlace.recentReport.label}</strong> (${topPlace.recentReport.timeFormatted})
        </div>
      ` : ''}
      <div class="top-place-actions">
        <button class="btn-primary" onclick="window.CoolNaviApp.startARForPlace('${topPlace.id}')">
          🧭 道路沿いARで避難案内
        </button>
        <button class="btn-secondary" onclick="window.CoolNaviApp.showPlaceDetail('${topPlace.id}')">
          施設詳細・評価
        </button>
      </div>
    `;
  },

  renderPlacesList() {
    const listEl = document.getElementById('places-list-container');
    if (!listEl) return;

    const evaluatedList = PlacesManager.getEvaluatedPlaces(this.currentLocation, this.activeFilter);

    if (evaluatedList.length === 0) {
      listEl.innerHTML = '<div class="empty-list">周辺のクーリングシェルターを検索中...</div>';
      return;
    }

    listEl.innerHTML = evaluatedList.map((place, index) => {
      const evalData = place.evaluation;
      const rankNumber = index + 1;
      const rankIcon = rankNumber === 1 ? '🥇' : rankNumber === 2 ? '🥈' : rankNumber === 3 ? '🥉' : `${rankNumber}.`;

      return `
        <div class="place-card ${place.coolingShelter ? 'card-shelter' : ''}" data-id="${place.id}">
          <div class="place-card-top">
            <span class="place-rank-number">${rankIcon}</span>
            <div class="place-title-wrap">
              <h4 class="place-name">${place.name}</h4>
              <div class="place-sub-badges">
                <span class="place-badge ${evalData.badgeClass}">${evalData.rank}</span>
                <span class="shelter-authority-pill">${place.designatedAuthority || '公的避難施設'}</span>
              </div>
            </div>
          </div>
          <div class="place-distance-bar">
            <span class="place-dist-val">徒歩 <strong>約${evalData.walkingMinutes}分</strong></span>
            <span class="place-dist-meters">約${evalData.formattedDistance}</span>
            <span class="place-crowd-tag crowd-${place.crowdLevel}">
              ${place.crowdLevel === 'low' ? '🟢 ゆったり休める' : place.crowdLevel === 'medium' ? '🟡 適度な混雑' : '🔴 混雑気味'}
            </span>
          </div>
          <div class="feature-tags-row">
            ${place.airConditioner ? '<span class="tag-pill">❄️ 強冷房</span>' : ''}
            ${place.seat ? '<span class="tag-pill">🪑 休憩座席</span>' : ''}
            ${place.waterDispenser ? '<span class="tag-pill water">💧 冷水・給水機</span>' : ''}
            ${place.toilet ? '<span class="tag-pill">🚻 トイレ</span>' : ''}
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
              🗺️ 避難ルート
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
          <span class="meta">🚶 道路沿い歩行 約${evalData.walkingMinutes}分 (${evalData.formattedDistance}) / 定員: ${place.capacity || 50}名</span>
        </div>
        <button class="banner-close-btn" onclick="document.getElementById('map-bottom-banner').classList.remove('active')">✕</button>
      </div>
      <div class="map-banner-actions">
        <button class="btn-primary" onclick="window.CoolNaviApp.startARForPlace('${place.id}')">
          🧭 道路沿いARで避難案内
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

  showPlaceDetail(placeId) {
    const place = PlacesManager.getPlaceById(placeId);
    if (!place) return;

    this.selectedPlace = place;
    const evalData = calculateRecommendationScore(place, this.currentLocation);
    const reports = PlacesManager.getReportsForPlace(place.id);

    const modalBody = document.getElementById('modal-place-detail-body');
    if (!modalBody) return;

    const distScore = evalData.distance <= 100 ? 35 : evalData.distance <= 300 ? 30 : evalData.distance <= 600 ? 24 : evalData.distance <= 1000 ? 15 : 8;
    const acScore = place.airConditioner ? 25 : 0;
    const csScore = place.coolingShelter ? 10 : 0;
    const seatScore = place.seat ? 10 : 0;
    const waterScore = place.waterDispenser ? 5 : 0;
    const crowdScore = place.crowdLevel === 'low' ? 5 : place.crowdLevel === 'medium' ? 3 : 0;

    modalBody.innerHTML = `
      <div class="detail-header">
        <div class="shelter-pill-badge">🏛️ 指定暑熱避難施設 (${place.designatedAuthority || '公的指定'})</div>
        <h2>${place.name}</h2>
        <div class="detail-distance-badge">
          🚶 徒歩 約<strong>${evalData.walkingMinutes}分</strong> (約${evalData.formattedDistance}) / 受入定員: <strong>${place.capacity || 50}名</strong>
        </div>
      </div>

      <div class="detail-section score-breakdown-section">
        <h4>📊 休みやすさ・避難適合スコア: ${evalData.score}点</h4>
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
            <span class="bar-label">公的指定・座席 (${csScore + seatScore}/20点)</span>
            <div class="bar-track"><div class="bar-fill seat" style="width: ${((csScore + seatScore)/20)*100}%;"></div></div>
          </div>
          <div class="score-bar-row">
            <span class="bar-label">給水・混雑ゆとり (${waterScore + crowdScore}/10点)</span>
            <div class="bar-track"><div class="bar-fill crowd" style="width: ${((waterScore + crowdScore)/10)*100}%;"></div></div>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h4>🏢 シェルター設備</h4>
        <div class="detail-grid">
          <div class="grid-item ${place.airConditioner ? 'checked' : 'cross'}">
            ${place.airConditioner ? '✅' : '❌'} 強冷房設備
          </div>
          <div class="grid-item ${place.seat ? 'checked' : 'cross'}">
            ${place.seat ? '✅' : '❌'} 休憩座席・ソファー
          </div>
          <div class="grid-item ${place.waterDispenser ? 'checked' : 'cross'}">
            ${place.waterDispenser ? '✅' : '❌'} 冷水機・給水スポット
          </div>
          <div class="grid-item ${place.toilet ? 'checked' : 'cross'}">
            ${place.toilet ? '✅' : '❌'} トイレ完備
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h4>ℹ️ 基本情報 (オープンデータ)</h4>
        <table class="detail-info-table">
          <tr><th>施設種別</th><td>${place.facilityType || '公共指定避難施設'}</td></tr>
          <tr><th>住所</th><td>${place.address}</td></tr>
          <tr><th>受入可能時間</th><td>${place.openingHours}</td></tr>
          <tr><th>受入可能人数</th><td>約${place.capacity || 50}名</td></tr>
          <tr><th>指定自治体</th><td>${place.designatedAuthority || '公的機関'}</td></tr>
        </table>
        <p class="detail-desc-text">${place.description}</p>
      </div>

      <div class="detail-section">
        <div class="report-header-flex">
          <h4>💬 現在の状況報告</h4>
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
          🧭 道路沿いARで避難案内
        </button>
        <button class="btn-secondary" onclick="window.CoolNaviApp.showOnMap('${place.id}')">
          🗺️ 避難経路
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

  async startARForPlace(placeId) {
    const place = PlacesManager.getPlaceById(placeId);
    if (!place) return;

    this.selectedPlace = place;
    this.closeAllModals();
    this.switchTab('ar');

    const arTargetName = document.getElementById('ar-target-name');
    if (arTargetName) arTargetName.textContent = place.name;

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

  renderAROverlay(state) {
    const arrowEl = document.getElementById('ar-direction-arrow');
    const distEl = document.getElementById('ar-distance-text');
    const walkEl = document.getElementById('ar-walking-text');
    const guideEl = document.getElementById('ar-guide-message');
    const compassHeadingEl = document.getElementById('ar-compass-heading');
    const radarIndicator = document.getElementById('radar-target-dot');

    const turnCard = document.getElementById('ar-turn-card');
    const turnIconEl = document.getElementById('ar-turn-icon');
    const turnTextEl = document.getElementById('ar-turn-instruction');
    const turnStepEl = document.getElementById('ar-turn-step-count');
    const floatingPin = document.getElementById('ar-floating-pin');

    if (arrowEl) {
      arrowEl.style.transform = `rotate(${state.relativeAngle}deg)`;
      if (state.isStraight) {
        arrowEl.classList.add('straight-forward');
      } else {
        arrowEl.classList.remove('straight-forward');
      }
    }

    if (turnCard && state.currentStepInfo) {
      turnCard.style.display = 'flex';
      if (turnIconEl) turnIconEl.textContent = state.turnIcon;
      if (turnTextEl) turnTextEl.textContent = state.stepInstruction;
      if (turnStepEl) {
        turnStepEl.textContent = `交差点 ${state.currentStepInfo.stepIndex + 1} / ${state.currentStepInfo.totalSteps}`;
      }
    }

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
      compassHeadingEl.textContent = `端末方位: ${Math.round(state.heading)}° / 避難交差点: ${Math.round(state.targetBearing)}°`;
    }

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
