/**
 * map.js - Leaflet + OpenStreetMap 地図制御 & 道路沿い歩行者ルート描画
 * 
 * 機能:
 * - Leaflet + OpenStreetMap 地図
 * - 現在地マーカー (青パルス円)
 * - 涼み場所ピン (おすすめ度別バッジ)
 * - 道路網に沿った正確な歩行者ルートポリラインの描画 (OSRMオープンデータ連携)
 * - ターンバイターン曲がり角マーカー
 */

const MapManager = {
  map: null,
  currentLocationMarker: null,
  currentAccuracyCircle: null,
  placeMarkers: {},
  routeLayerGroup: null,
  selectedPlaceId: null,
  onPlaceSelectCallback: null,

  /**
   * 地図の初期化
   */
  initMap(containerId = 'map-container', onPlaceSelect = null) {
    if (this.map) return;

    this.onPlaceSelectCallback = onPlaceSelect;

    const defaultLat = 35.681236;
    const defaultLng = 139.767125;

    this.map = L.map(containerId, {
      center: [defaultLat, defaultLng],
      zoom: 15,
      zoomControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    this.routeLayerGroup = L.layerGroup().addTo(this.map);
  },

  /**
   * 現在地マーカーの更新
   */
  updateCurrentLocation(location, panToCenter = false) {
    if (!this.map || !location) return;

    const latLng = [location.latitude, location.longitude];

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
  },

  /**
   * 涼み場所のピン一覧を描画
   */
  renderPlaceMarkers(places) {
    if (!this.map) return;

    Object.values(this.placeMarkers).forEach(marker => this.map.removeLayer(marker));
    this.placeMarkers = {};

    places.forEach(place => {
      const isTopScore = place.evaluation && place.evaluation.score >= 80;
      const isOpenData = place.isOpenDataLive;
      const markerClass = isTopScore ? 'place-marker-icon super-place' : (isOpenData ? 'place-marker-icon opendata-place' : 'place-marker-icon');

      const customIcon = L.divIcon({
        className: 'place-marker-container',
        html: `
          <div class="${markerClass}">
            <span class="marker-symbol">${isOpenData ? '📍' : '❄️'}</span>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36]
      });

      const marker = L.marker([place.latitude, place.longitude], {
        icon: customIcon
      }).addTo(this.map);

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
          <button class="popup-select-btn" onclick="window.CoolNaviApp.selectPlaceFromMap('${place.id}')">
            ここへ行く・道路沿い案内
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
   * 実際の道路網に沿ったルートポリラインを描画
   * @param {Object} routeData OSRMのルートデータ
   * @param {boolean} autoFit 画面内にルートを自動フィットさせるか
   */
  drawRoadRoute(routeData, autoFit = true) {
    if (!this.map || !this.routeLayerGroup) return;

    this.routeLayerGroup.clearLayers();

    if (!routeData || !routeData.coordinates || routeData.coordinates.length < 2) return;

    // 1. ルートのアウトライン (影・背景線)
    const outlinePolyline = L.polyline(routeData.coordinates, {
      color: '#0B2545',
      weight: 8,
      opacity: 0.35,
      lineCap: 'round',
      lineJoin: 'round'
    });
    this.routeLayerGroup.addLayer(outlinePolyline);

    // 2. メインの道路沿いルートライン (クールブルー)
    const mainPolyline = L.polyline(routeData.coordinates, {
      color: '#0096C7',
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    });
    this.routeLayerGroup.addLayer(mainPolyline);

    // 3. ルート上の曲がり角 (ターンポイント) に小さな目印アイコンを配置
    if (routeData.steps && routeData.steps.length > 2) {
      routeData.steps.slice(1, -1).forEach(step => {
        const turnDot = L.circleMarker(step.location, {
          radius: 5,
          color: '#FFFFFF',
          fillColor: '#FF7A00',
          fillOpacity: 1,
          weight: 2
        });
        turnDot.bindTooltip(step.instruction, { direction: 'top', offset: [0, -6] });
        this.routeLayerGroup.addLayer(turnDot);
      });
    }

    if (autoFit) {
      this.map.fitBounds(mainPolyline.getBounds(), {
        padding: [50, 50],
        maxZoom: 17
      });
    }
  },

  /**
   * ルート描画を消去
   */
  clearRoute() {
    if (this.routeLayerGroup) {
      this.routeLayerGroup.clearLayers();
    }
  },

  /**
   * 目的地を選択
   */
  selectDestination(place) {
    this.selectedPlaceId = place ? place.id : null;
    if (place && this.map) {
      if (this.placeMarkers[place.id]) {
        this.placeMarkers[place.id].openPopup();
      }
    }
  },

  /**
   * タブ切り替え時等に地図サイズ再計算
   */
  invalidateSize() {
    if (this.map) {
      setTimeout(() => {
        this.map.invalidateSize();
      }, 150);
    }
  }
};
