/**
 * location.js - Geolocation API 管理
 * 
 * ユーザーのリアルな現在地(GPS)を正確に取得します。
 * 東京駅などの固定モックデータは使用せず、端末の位置情報を直接利用します。
 */

const LocationManager = {
  currentLocation: null,
  watchId: null,

  /**
   * 現在地(GPS)を取得する
   * @returns {Promise<Object>} { latitude, longitude, accuracy, timestamp }
   */
  async getCurrentPosition() {
    if (!navigator.geolocation) {
      throw new Error("お使いの端末・ブラウザは位置情報に対応していません。");
    }

    return new Promise((resolve, reject) => {
      const options = {
        enableHighAccuracy: true, // 高精度GPS
        timeout: 12000,           // 最大12秒待機
        maximumAge: 0             // キャッシュを使わず最新の現在地を取得
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.currentLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
          };
          resolve(this.currentLocation);
        },
        (error) => {
          let errorMessage = "現在地を取得できませんでした。";
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = "位置情報が許可されていません。\nブラウザ設定で位置情報を「許可」してください。";
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = "現在地の測位情報が取得できませんでした。\n通信環境の良い場所でお試しください。";
              break;
            case error.TIMEOUT:
              errorMessage = "位置情報の取得がタイムアウトしました。\n再度お試しください。";
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
   * 移動中のリアルタイム位置追跡
   */
  startWatch(onUpdate, onError) {
    if (this.watchId !== null) {
      this.stopWatch();
    }

    if (!navigator.geolocation) {
      if (onError) onError(new Error("位置情報非対応ブラウザです。"));
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.currentLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
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
        maximumAge: 3000
      }
    );
  },

  stopWatch() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
};
