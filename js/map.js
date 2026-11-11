/**
 * map.js - Leaflet + OpenStreetMap 地図制御
 * 
 * 仕様書の要件:
 * - Leaflet + OpenStreetMap を使用
 * - 現在地 (青いピン・パルス円) のリアルタイム表示
 * - 涼み場所ピンの表示 (おすすめ度に応じたスタイル、ポップアップ)
 * - 選択した目的地との間の方向線・ハイライト
 * - モバイルでのスムーズな操作感
 */

const MapManager = {
  map: null,
  currentLocationMarker: null,
  currentAccuracyCircle: null,
  placeMarkers: {},
  destinationLine: null,
  selectedPlaceId: null,
  onPlaceSelectCallback: null,

  /**
   * 地図の初期化
   * @param {string} containerId 地図を表示する要素のID
   * @param {Function} onPlaceSelect ピンタップ時のコールバック
   */
  initMap(containerId = 'map-container', onPlaceSelect = null) {
    if (this.map) return;

    this.onPlaceSelectCallback = onPlaceSelect;

    // デフォルトの中心位置 (東京駅周辺)
    const defaultLat = 35.681236;
    const defaultLng = 139.767125;

    this.map = L.map(containerId, {
      center: [defaultLat, defaultLng],
      zoom: 15,
      zoomControl: false // スマホ向けに右下に再配置
    });

    // ズームコントロールを右下に配置 (片手操作しやすい)
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // OpenStreetMap タイルレイヤー
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);
  },

  /**
   * 現在地マーカーの更新・表示
   * @param {Object} location { latitude, longitude, accuracy }
   * @param {boolean} panToCenter 地図の中心を現在地へ移動するか
   */
  updateCurrentLocation(location, panToCenter = false) {
    if (!this.map || !location) return;

    const latLng = [location.latitude, location.longitude];

    // 現在地用カスタムHTMLアイコン (青い点と波紋アニメーション)
    const currentLocIcon = L.divIcon({
      className: 'current-location-marker-container',
      html: `
        <div class="current-location-pulse"></div>
        <div class="current-location-dot"></div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    if (!this.currentLocationMarker) {
      this.currentLocationMarker = L.marker(latLng, {
        icon: currentLocIcon,
        zIndexOffset: 1000
      }).addTo(this.map);
    } else {
      this.currentLocationMarker.setLatLng(latLng);
    }

    // 精度サークルの表示
    if (location.accuracy && location.accuracy > 0) {
      if (!this.currentAccuracyCircle) {
        this.currentAccuracyCircle = L.circle(latLng, {
          radius: Math.min(location.accuracy, 200),
          color: '#0096C7',
          fillColor: '#00B4D8',
          fillOpacity: 0.12,
          weight: 1
        }).addTo(this.map);
      } else {
        this.currentAccuracyCircle.setLatLng(latLng);
        this.currentAccuracyCircle.setRadius(Math.min(location.accuracy, 200));
      }
    }

    if (panToCenter) {
      this.map.setView(latLng, 16);
    }

    // 目的地選択中ならラインを更新
    if (this.selectedPlaceId) {
      this.updateDestinationLine();
    }
  },

  /**
   * 涼み場所のピン一覧を描画
   * @param {Array} places 評価付き施設配列
   */
  renderPlaceMarkers(places) {
    if (!this.map) return;

    // 既存マーカーのクリア
    Object.values(this.placeMarkers).forEach(marker => this.map.removeLayer(marker));
    this.placeMarkers = {};

    places.forEach(place => {
      const isTopScore = place.evaluation && place.evaluation.score >= 80;
      const markerClass = isTopScore ? 'place-marker-icon super-place' : 'place-marker-icon';

      const customIcon = L.divIcon({
        className: 'place-marker-container',
        html: `
          <div class="${markerClass}">
            <span class="marker-symbol">❄️</span>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36]
      });

      const marker = L.marker([place.latitude, place.longitude], {
        icon: customIcon
      }).addTo(this.map);

      // ポップアップ内容
      const popupContent = `
        <div class="map-popup-card">
          <div class="popup-title">${place.name}</div>
          <div class="popup-badges">
            <span class="popup-badge ${place.evaluation ? place.evaluation.badgeClass : ''}">
              ${place.evaluation ? place.evaluation.rank : '涼みスポット'}
            </span>
            <span class="popup-dist">🚶 約${place.evaluation ? place.evaluation.walkingMinutes : '--'}分 (${place.evaluation ? place.evaluation.formattedDistance : ''})</span>
          </div>
          <div class="popup-features">
            ${place.airConditioner ? '<span class="feat-tag">❄️ 冷房</span>' : ''}
            ${place.seat ? '<span class="feat-tag">🪑 座席</span>' : ''}
            ${place.toilet ? '<span class="feat-tag">🚻 トイレ</span>' : ''}
          </div>
          <button class="popup-select-btn" onclick="window.CoolNaviApp.selectPlaceFromMap(${place.id})">
            ここへ行く・詳細
          </button>
        </div>
      `;

      marker.bindPopup(popupContent, { maxWidth: 260 });

      marker.on('click', () => {
        if (this.onPlaceSelectCallback) {
          this.onPlaceSelectCallback(place);
        }
      });

      this.placeMarkers[place.id] = marker;
    });
  },

  /**
   * 目的地を選択しハイライト & ライン描画
   * @param {Object} place 
   * @param {Object} currentLocation 
   */
  selectDestination(place, currentLocation) {
    this.selectedPlaceId = place ? place.id : null;
    this.updateDestinationLine(currentLocation);

    if (place && this.map) {
      this.map.setView([place.latitude, place.longitude], 16);
      if (this.placeMarkers[place.id]) {
        this.placeMarkers[place.id].openPopup();
      }
    }
  },

  /**
   * 現在地と目的地を結ぶガイドラインを描画
   */
  updateDestinationLine(currentLocation) {
    if (!this.map) return;

    if (this.destinationLine) {
      this.map.removeLayer(this.destinationLine);
      this.destinationLine = null;
    }

    if (!this.selectedPlaceId) return;

    const marker = this.placeMarkers[this.selectedPlaceId];
    const loc = currentLocation || LocationManager.currentLocation;

    if (marker && loc) {
      const start = [loc.latitude, loc.longitude];
      const end = marker.getLatLng();

      this.destinationLine = L.polyline([start, end], {
        color: '#FF7A00',
        weight: 4,
        opacity: 0.8,
        dashArray: '8, 8',
        lineCap: 'round'
      }).addTo(this.map);
    }
  },

  /**
   * タブ切り替え時等に地図表示サイズを再計算
   */
  invalidateSize() {
    if (this.map) {
      setTimeout(() => {
        this.map.invalidateSize();
      }, 150);
    }
  }
};
