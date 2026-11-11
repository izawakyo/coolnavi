/**
 * places.js - 涼み場所データと気象情報の読み込み・管理・利用状況報告
 * 
 * 仕様書の要件:
 * - /data/places.json, /data/weather.json からfetchで読み込む
 * - 将来的にオープンデータAPIへの置き換えが容易な設計 (loadPlaces, loadWeather)
 * - ユーザー利用状況報告機能 (座れた/冷房が効いていた/混雑していた/満席だった)
 *   localStorage を使ってクライアントサイドで即座に保存・反映
 */

const PlacesManager = {
  places: [],
  weather: null,
  LOCAL_STORAGE_REPORTS_KEY: 'coolnavi_user_reports',

  /**
   * 涼み場所データを読み込む
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
      console.error('涼み場所データの読み込みに失敗しました:', error);
      // フォールバック用の最小限データ
      this.places = [
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
          description: "涼しい読書スペースとカフェが併設されています。"
        }
      ];
      return this.places;
    }
  },

  /**
   * 気象情報を読み込む
   * @returns {Promise<Object>}
   */
  async loadWeather() {
    try {
      const response = await fetch('data/weather.json');
      if (!response.ok) {
        throw new Error(`HTTPエラー: ${response.status}`);
      }
      this.weather = await response.json();
      return this.weather;
    } catch (error) {
      console.error('気象データの読み込みに失敗しました:', error);
      this.weather = {
        currentTemp: 32,
        maxTemp: 35,
        humidity: 65,
        heatStrokeAlert: "厳重警戒",
        message: "こまめな水分補給と涼しい場所での休憩を心がけてください。"
      };
      return this.weather;
    }
  },

  /**
   * IDから施設を取得
   * @param {number|string} id 
   * @returns {Object|null}
   */
  getPlaceById(id) {
    return this.places.find(p => String(p.id) === String(id)) || null;
  },

  /**
   * 現在地に基づいて施設一覧に距離とおすすめスコアを付与して取得
   * @param {Object} currentLocation { latitude, longitude }
   * @param {string} sortBy 'recommend' | 'distance'
   * @returns {Array} 評価付き施設配列
   */
  getEvaluatedPlaces(currentLocation, sortBy = 'recommend') {
    const list = this.places.map(place => {
      const evalData = calculateRecommendationScore(place, currentLocation);
      const reports = this.getReportsForPlace(place.id);
      return {
        ...place,
        evaluation: evalData,
        recentReport: reports.length > 0 ? reports[0] : null
      };
    });

    if (sortBy === 'distance') {
      list.sort((a, b) => a.evaluation.distance - b.evaluation.distance);
    } else {
      // おすすめ順 (スコア降順、同点なら距離昇順)
      list.sort((a, b) => {
        if (b.evaluation.score !== a.evaluation.score) {
          return b.evaluation.score - a.evaluation.score;
        }
        return a.evaluation.distance - b.evaluation.distance;
      });
    }

    return list;
  },

  /**
   * 最もおすすめの施設を1件取得 (ホーム画面用)
   * @param {Object} currentLocation 
   * @returns {Object|null}
   */
  getTopRecommendedPlace(currentLocation) {
    const list = this.getEvaluatedPlaces(currentLocation, 'recommend');
    return list.length > 0 ? list[0] : null;
  },

  /**
   * 施設の利用状況報告一覧を取得
   * @param {number|string} placeId 
   * @returns {Array}
   */
  getReportsForPlace(placeId) {
    try {
      const allReports = JSON.parse(localStorage.getItem(this.LOCAL_STORAGE_REPORTS_KEY) || '{}');
      return allReports[placeId] || [];
    } catch (e) {
      return [];
    }
  },

  /**
   * 施設の利用状況をユーザーが報告 (仕様書第17項)
   * @param {number|string} placeId 
   * @param {string} reportType 'seated' | 'cool' | 'crowded' | 'full'
   * @param {string} note 任意のコメント
   */
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
      // 直近5件まで保持
      if (allReports[placeId].length > 5) {
        allReports[placeId] = allReports[placeId].slice(0, 5);
      }
      localStorage.setItem(this.LOCAL_STORAGE_REPORTS_KEY, JSON.stringify(allReports));
      return newReport;
    } catch (e) {
      console.warn('報告の保存に失敗しました:', e);
      return newReport;
    }
  }
};
