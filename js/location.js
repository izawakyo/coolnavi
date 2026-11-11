/**
 * location.js - Geolocation API の管理
 * 
 * 仕様書の要件:
 * - navigator.geolocation.getCurrentPosition() で現在地取得
 * - navigator.geolocation.watchPosition() で移動中のリアルタイム追跡
 * - 取得情報: latitude, longitude, accuracy
 * - 失敗時のユーザー向け分かりやすい日本語エラーメッセージ
 * - 安全性配慮: サーバー送信なし、クライアント内完結
 * - PC開発・テスト用のデモ位置シミュレーション機能
 */

const LocationManager = {
  // 現在の位置情報キャッシュ
  currentLocation: null,
  watchId: null,
  isMockMode: false,

  // デモ用位置 (東京駅 丸の内中央口周辺)
  MOCK_LOCATION: {
    latitude: 35.681236,
    longitude: 139.767125,
    accuracy: 15,
    isMock: true,
    timestamp: Date.now()
  },

  /**
   * 現在地を1度取得する
   * @param {boolean} forceReal GPSを強制するか (falseならデモモード設定を考慮)
   * @returns {Promise<Object>} { latitude, longitude, accuracy, timestamp }
   */
  async getCurrentPosition(forceReal = false) {
    if (this.isMockMode && !forceReal) {
      this.currentLocation = { ...this.MOCK_LOCATION, timestamp: Date.now() };
      return this.currentLocation;
    }

    if (!navigator.geolocation) {
      throw new Error("お使いのブラウザは位置情報サービスに対応していません。");
    }

    return new Promise((resolve, reject) => {
      const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.currentLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            isMock: false,
            timestamp: position.timestamp
          };
          resolve(this.currentLocation);
        },
        (error) => {
          let errorMessage = "現在地を取得できませんでした。";
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = "位置情報の利用が許可されていません。\nブラウザの設定で位置情報を許可してください。";
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = "現在地の測位情報が取得できませんでした。\n通信環境の良い場所で再度お試しください。";
              break;
            case error.TIMEOUT:
              errorMessage = "位置情報の取得がタイムアウトしました。\n屋外など電波の届く場所で再度お試しください。";
              break;
          }
          const err = new Error(errorMessage);
          err.code = error.code;
          reject(err);
        },
        options
      );
    });
  },

  /**
   * 移動中の位置情報追跡を開始
   * @param {Function} onUpdate 位置更新時コールバック
   * @param {Function} onError エラー時コールバック
   */
  startWatch(onUpdate, onError) {
    if (this.watchId !== null) {
      this.stopWatch();
    }

    if (this.isMockMode) {
      // デモモード時は疑似的に現在地を返し、終了
      if (onUpdate) onUpdate(this.MOCK_LOCATION);
      return;
    }

    if (!navigator.geolocation) {
      if (onError) onError(new Error("位置情報サービス非対応ブラウザです。"));
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.currentLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          isMock: false,
          timestamp: position.timestamp
        };
        if (onUpdate) onUpdate(this.currentLocation);
      },
      (error) => {
        if (onError) onError(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000
      }
    );
  },

  /**
   * 位置情報の追跡を停止
   */
  stopWatch() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  },

  /**
   * デモモードの切り替え (PCテスト用 / 実機テスト用)
   * @param {boolean} enabled 
   */
  setMockMode(enabled) {
    this.isMockMode = enabled;
    if (enabled) {
      this.currentLocation = { ...this.MOCK_LOCATION, timestamp: Date.now() };
    }
    return this.currentLocation;
  }
};
