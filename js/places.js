/**
 * places.js - 実際のオープンデータAPI連携 & 涼み場所・気象情報管理
 * 
 * 実際のオープンデータ連携:
 * 1. OpenStreetMap Overpass API
 *    - 現在地周辺(半径1.2km)の図書館、コミュニティセンター、区役所、カフェ、休憩スポットを動的取得
 * 2. Open-Meteo リアルタイム気象オープンデータ API
 *    - 現在地座標の最新気温、最高気温、湿度を動的取得し、暑さ指数(WBGT)・警戒レベルを算出
 * 3. ユーザー利用状況報告機能 (localStorage)
 * 4. オフライン時・通信遅延時の安全なプリセットJSONフォールバック
 */

const PlacesManager = {
  places: [],
  weather: null,
  isLiveOpenDataActive: false,
  isLiveWeatherActive: false,
  LOCAL_STORAGE_REPORTS_KEY: 'coolnavi_user_reports',

  /**
   * 涼み場所データの初期ロード
   * @returns {Promise<Array>}
   */
  async loadPlaces() {
    try {
      const response = await fetch('data/places.json');
      if (!response.ok) {
        throw new Error(`HTTPエラー: ${response.status}`);
      }
      this.places = await response.json();
      return this.places;
    } catch (error) {
      console.warn('ローカルplaces.jsonの読み込みフォールバック:', error);
      this.places = this.getFallbackPresetPlaces();
      return this.places;
    }
  },

  /**
   * 実際のオープンデータ (OpenStreetMap Overpass API) から周辺の涼み場所を動的取得
   * @param {number} lat 現在地緯度
   * @param {number} lon 現在地経度
   * @param {number} radius 検索半径(m)
   * @returns {Promise<Array>}
   */
  async fetchLiveOpenDataPlaces(lat, lon, radius = 1200) {
    // 図書館、公民館・コミュニティセンター、役所、カフェ、博物館などの涼みスポットを検索
    const overpassQuery = `
      [out:json][timeout:8];
      (
        node["amenity"="library"](around:${radius},${lat},${lon});
        node["amenity"="community_centre"](around:${radius},${lat},${lon});
        node["amenity"="townhall"](around:${radius},${lat},${lon});
        node["amenity"="cafe"](around:${radius},${lat},${lon});
        node["tourism"="museum"](around:${radius},${lat},${lon});
      );
      out body 15;
    `;

    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(6500) });
      if (!response.ok) throw new Error(`Overpass API Error: ${response.status}`);

      const data = await response.json();
      if (!data.elements || data.elements.length === 0) {
        throw new Error("周辺のオープンデータスポットが0件でした");
      }

      const openDataPlaces = data.elements
        .filter(el => el.tags && (el.tags.name || el.tags["name:ja"]))
        .map((el, index) => {
          const tags = el.tags || {};
          const name = tags["name:ja"] || tags.name || "涼みスポット";
          const amenity = tags.amenity || tags.tourism || "";

          // 施設種別に応じた設備・休みの推定
          const isLibrary = amenity === 'library' || name.includes('図書館');
          const isPublic = amenity === 'community_centre' || amenity === 'townhall' || name.includes('区役所') || name.includes('センター');
          const isCafe = amenity === 'cafe' || name.includes('カフェ');

          return {
            id: `osm_${el.id || index}`,
            name,
            latitude: el.lat,
            longitude: el.lon,
            address: tags["addr:full"] || tags["addr:city"] ? `${tags["addr:city"] || ""}${tags["addr:street"] || ""}` : "現在地周辺",
            openingHours: tags.opening_hours || (isLibrary ? "9:00〜20:00" : isPublic ? "8:30〜17:15" : "10:00〜21:00"),
            airConditioner: true, // 公共施設・カフェは冷房完備
            seat: isLibrary || isCafe || isPublic,
            toilet: isLibrary || isPublic,
            indoor: true,
            crowdLevel: isCafe ? "medium" : "low",
            lastUpdated: "オープンデータ (OSM)",
            isOpenDataLive: true,
            description: isLibrary ? "冷房と座席が完備された静かな読書・休憩スポット。" :
                         isPublic ? "無料で利用できる公共の休憩ロビー・冷房完備スペース。" :
                         isCafe ? "涼しい店内で水分補給と休息ができるカフェスペース。" : "冷房の効いた快適な屋内スポット。"
          };
        });

      if (openDataPlaces.length > 0) {
        this.isLiveOpenDataActive = true;
        // 既存プリセットとマージ (重複を避ける)
        const combined = [...openDataPlaces, ...this.places.filter(p => !p.isOpenDataLive)];
        this.places = combined;
        return this.places;
      }
      return this.places;
    } catch (err) {
      console.warn("Overpass API取得失敗。プリセットデータで継続します:", err.message);
      this.isLiveOpenDataActive = false;
      return this.places;
    }
  },

  /**
   * 実際の気象オープンデータ (Open-Meteo API) からリアルタイム気温・天気を取得
   * @param {number} lat 
   * @param {number} lon 
   * @returns {Promise<Object>}
   */
  async fetchLiveWeather(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max&timezone=auto`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`Weather API Error: ${response.status}`);

      const data = await response.json();
      const currentTemp = Math.round(data.current.temperature_2m);
      const humidity = Math.round(data.current.relative_humidity_2m);
      const maxTemp = (data.daily && data.daily.temperature_2m_max && data.daily.temperature_2m_max[0])
        ? Math.round(data.daily.temperature_2m_max[0])
        : currentTemp + 2;

      // 簡易WBGT (暑さ指数) の算出: 0.735 * Temp + 0.0374 * Humid + 0.00292 * Temp * Humid - 4.06
      const estWbgt = Math.round(0.735 * currentTemp + 0.0374 * humidity + (0.00292 * currentTemp * humidity) - 4);

      let heatStrokeAlert = "注意";
      let message = "こまめな水分補給を心がけましょう。";

      if (currentTemp >= 35 || estWbgt >= 31) {
        heatStrokeAlert = "危険（原則運動中止）";
        message = "屋外の直射日光は非常に危険です。今すぐ涼しい屋内へ避難してください。";
      } else if (currentTemp >= 31 || estWbgt >= 28) {
        heatStrokeAlert = "厳重警戒（外出要注意）";
        message = "「まだ大丈夫」と我慢せず、早めに涼しい場所でクールダウンしましょう。";
      } else if (currentTemp >= 28 || estWbgt >= 25) {
        heatStrokeAlert = "警戒（熱中症リスク）";
        message = "喉が渇く前に涼しい場所で定期的な休憩を取りましょう。";
      }

      this.weather = {
        currentTemp,
        maxTemp,
        humidity,
        heatStrokeAlert,
        wbgt: estWbgt,
        message,
        isLive: true,
        lastUpdated: "リアルタイム気象オープンデータ"
      };
      this.isLiveWeatherActive = true;
      return this.weather;
    } catch (err) {
      console.warn("Open-Meteo取得失敗。初期気象データを使用します:", err.message);
      return this.loadWeather();
    }
  },

  /**
   * 初期気象データ (JSON) のロード
   */
  async loadWeather() {
    try {
      const response = await fetch('data/weather.json');
      if (response.ok) {
        this.weather = await response.json();
        return this.weather;
      }
    } catch (e) {}

    this.weather = {
      currentTemp: 33,
      maxTemp: 36,
      humidity: 68,
      heatStrokeAlert: "厳重警戒",
      wbgt: 31,
      message: "「まだ大丈夫」と我慢せず、早めに涼しい場所でクールダウンしましょう。",
      lastUpdated: "2026-11-11"
    };
    return this.weather;
  },

  getPlaceById(id) {
    return this.places.find(p => String(p.id) === String(id)) || null;
  },

  getEvaluatedPlaces(currentLocation, sortBy = 'recommend') {
    const list = this.places.map(place => {
      const evalData = calculateRecommendationScore(place, currentLocation);
      const reports = this.getReportsForPlace(place.id);
      
      // ユーザーの「満席だった」報告があれば一時的に混雑度を高に変更
      const isReportedFull = reports.length > 0 && reports[0].type === 'full';
      const effectiveCrowd = isReportedFull ? 'high' : place.crowdLevel;

      return {
        ...place,
        crowdLevel: effectiveCrowd,
        evaluation: evalData,
        recentReport: reports.length > 0 ? reports[0] : null
      };
    });

    if (sortBy === 'distance') {
      list.sort((a, b) => a.evaluation.distance - b.evaluation.distance);
    } else {
      list.sort((a, b) => {
        if (b.evaluation.score !== a.evaluation.score) {
          return b.evaluation.score - a.evaluation.score;
        }
        return a.evaluation.distance - b.evaluation.distance;
      });
    }

    return list;
  },

  getTopRecommendedPlace(currentLocation) {
    const list = this.getEvaluatedPlaces(currentLocation, 'recommend');
    return list.length > 0 ? list[0] : null;
  },

  getReportsForPlace(placeId) {
    try {
      const allReports = JSON.parse(localStorage.getItem(this.LOCAL_STORAGE_REPORTS_KEY) || '{}');
      return allReports[placeId] || [];
    } catch (e) {
      return [];
    }
  },

  addReport(placeId, reportType, note = '') {
    const typeLabels = {
      'seated': '座れた',
      'cool': '冷房が効いていた',
      'crowded': '混雑していた',
      'full': '満席だった'
    };

    const newReport = {
      type: reportType,
      label: typeLabels[reportType] || reportType,
      note,
      timestamp: Date.now(),
      timeFormatted: 'たった今'
    };

    try {
      const allReports = JSON.parse(localStorage.getItem(this.LOCAL_STORAGE_REPORTS_KEY) || '{}');
      if (!allReports[placeId]) {
        allReports[placeId] = [];
      }
      allReports[placeId].unshift(newReport);
      if (allReports[placeId].length > 5) {
        allReports[placeId] = allReports[placeId].slice(0, 5);
      }
      localStorage.setItem(this.LOCAL_STORAGE_REPORTS_KEY, JSON.stringify(allReports));
      return newReport;
    } catch (e) {
      return newReport;
    }
  },

  getFallbackPresetPlaces() {
    return [
      {
        id: 1,
        name: "千代田区立 日比谷図書文化館",
        latitude: 35.672016,
        longitude: 139.752399,
        address: "東京都千代田区日比谷公園1-4",
        openingHours: "10:00〜22:00",
        airConditioner: true,
        seat: true,
        toilet: true,
        indoor: true,
        crowdLevel: "low",
        description: "静かで涼しい読書スペースとカフェが併設された涼みスポット。"
      }
    ];
  }
};
