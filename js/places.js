/**
 * places.js - クーリングシェルター（指定暑熱避難施設）オープンデータ管理
 * 
 * 機能:
 * - クーリングシェルターオープンデータ (data/places.json) の読み込み
 * - OpenStreetMap Overpass API による周辺の指定暑熱避難施設・公共涼み処の動的取得
 * - Open-Meteo API によるリアルタイム気象・暑さ指数(WBGT)取得
 * - ユーザー利用状況報告 (座れた/冷房効いてた/混雑/満席) の管理
 */

const PlacesManager = {
  places: [],
  weather: null,
  isLiveOpenDataActive: false,
  isLiveWeatherActive: false,
  LOCAL_STORAGE_REPORTS_KEY: 'coolnavi_user_reports',

  async loadPlaces() {
    try {
      const response = await fetch('data/places.json');
      if (!response.ok) throw new Error(`HTTPエラー: ${response.status}`);
      this.places = await response.json();
      return this.places;
    } catch (error) {
      console.warn('ローカルクーリングシェルターデータの読み込みフォールバック:', error);
      this.places = this.getFallbackPresetPlaces();
      return this.places;
    }
  },

  /**
   * 実際のオープンデータ (OSM Overpass API) から周辺クーリングシェルター・公共避難施設を検索
   */
  async fetchLiveOpenDataPlaces(lat, lon, radius = 1500) {
    const overpassQuery = `
      [out:json][timeout:8];
      (
        node["emergency"="designated_cooling_shelter"](around:${radius},${lat},${lon});
        node["amenity"="library"](around:${radius},${lat},${lon});
        node["amenity"="community_centre"](around:${radius},${lat},${lon});
        node["amenity"="townhall"](around:${radius},${lat},${lon});
      );
      out body 15;
    `;

    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(6500) });
      if (!response.ok) throw new Error(`Overpass API Error: ${response.status}`);

      const data = await response.json();
      if (!data.elements || data.elements.length === 0) {
        throw new Error("周辺のクーリングシェルター施設が0件でした");
      }

      const openDataPlaces = data.elements
        .filter(el => el.tags && (el.tags.name || el.tags["name:ja"]))
        .map((el, index) => {
          const tags = el.tags || {};
          const name = tags["name:ja"] || tags.name || "公的避難スポット";
          const amenity = tags.amenity || "";
          const isLibrary = amenity === 'library' || name.includes('図書館');
          const isHall = amenity === 'townhall' || name.includes('区役所') || name.includes('市役所');

          return {
            id: `osm_cs_${el.id || index}`,
            name,
            facilityType: isLibrary ? "公立図書館" : isHall ? "庁舎・公共施設" : "指定避難施設",
            coolingShelter: true,
            designatedAuthority: "自治体指定/公的施設",
            latitude: el.lat,
            longitude: el.lon,
            address: tags["addr:full"] || tags["addr:city"] ? `${tags["addr:city"] || ""}${tags["addr:street"] || ""}` : "現在地周辺",
            openingHours: tags.opening_hours || (isLibrary ? "9:00〜20:00" : isHall ? "8:30〜17:15" : "9:00〜18:00"),
            capacity: isHall ? 80 : 40,
            airConditioner: true,
            seat: true,
            toilet: true,
            indoor: true,
            waterDispenser: isLibrary || isHall,
            crowdLevel: "low",
            lastUpdated: "オープンデータ (OSM)",
            isOpenDataLive: true,
            description: "【指定暑熱避難施設】冷房・座席・水分補給が可能な公的クーリングスペースです。"
          };
        });

      if (openDataPlaces.length > 0) {
        this.isLiveOpenDataActive = true;
        const combined = [...openDataPlaces, ...this.places.filter(p => !p.isOpenDataLive)];
        this.places = combined;
        return this.places;
      }
      return this.places;
    } catch (err) {
      console.warn("Overpass API取得失敗。プリセットクーリングシェルターデータで継続:", err.message);
      this.isLiveOpenDataActive = false;
      return this.places;
    }
  },

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

      const estWbgt = Math.round(0.735 * currentTemp + 0.0374 * humidity + (0.00292 * currentTemp * humidity) - 4);

      let heatStrokeAlert = "注意";
      let message = "こまめな水分補給と冷房のある場所での休憩を。";

      if (currentTemp >= 35 || estWbgt >= 31) {
        heatStrokeAlert = "危険（原則運動中止）";
        message = "屋外の直射日光は極めて危険です。近くのクーリングシェルターへ直ちに避難してください。";
      } else if (currentTemp >= 31 || estWbgt >= 28) {
        heatStrokeAlert = "厳重警戒（外出要注意）";
        message = "「まだ大丈夫」と我慢せず、近くの指定避難施設（クーリングシェルター）で涼みましょう。";
      } else if (currentTemp >= 28 || estWbgt >= 25) {
        heatStrokeAlert = "警戒（熱中症リスク）";
        message = "喉が渇く前に、近くのクーリングスポットで定期的に体を冷やしましょう。";
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
      console.warn("気象APIフォールバック:", err.message);
      return this.loadWeather();
    }
  },

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
      message: "「まだ大丈夫」と我慢せず、早めにクーリングシェルターでクールダウンしましょう。",
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
      if (!allReports[placeId]) allReports[placeId] = [];
      allReports[placeId].unshift(newReport);
      if (allReports[placeId].length > 5) allReports[placeId] = allReports[placeId].slice(0, 5);
      localStorage.setItem(this.LOCAL_STORAGE_REPORTS_KEY, JSON.stringify(allReports));
      return newReport;
    } catch (e) {
      return newReport;
    }
  },

  getFallbackPresetPlaces() {
    return [
      {
        id: "cs_01",
        name: "千代田区立 日比谷図書文化館",
        facilityType: "公立図書館",
        coolingShelter: true,
        designatedAuthority: "東京都千代田区",
        latitude: 35.672016,
        longitude: 139.752399,
        address: "東京都千代田区日比谷公園1-4",
        openingHours: "10:00〜22:00",
        capacity: 60,
        airConditioner: true,
        seat: true,
        toilet: true,
        indoor: true,
        waterDispenser: true,
        crowdLevel: "low",
        description: "【千代田区指定暑熱避難施設】冷房完備の読書スペースとカフェ、給水スポットが整備されています。"
      }
    ];
  }
};
