/**
 * ar.js - 簡易AR案内 (Webカメラ + DeviceOrientation API)
 * 
 * 仕様書の要件:
 * - 「カメラを向けると、目的地の方向と距離が分かる」簡易AR
 * - カメラ利用: navigator.mediaDevices.getUserMedia (背面カメラ)
 * - 端末向き取得: DeviceOrientation API (iOS Safari の requestPermission 対応)
 * - 目的地の方位角 (Bearing) と端末の向きから相対角度を算出
 * - 正面 ↑、右 →、左 ← などの方向ガイドと残り距離表示
 * - カメラ不許可・非対応環境では2Dコンパス・レーダーモードへ自動フォールバック
 * - プライバシー重視: 映像は保存・送信しない
 */

const ARManager = {
  videoElement: null,
  stream: null,
  isCameraActive: false,
  isOrientationActive: false,
  orientationPermissionGranted: false,
  
  // 現在のナビゲーション対象
  currentDestination: null,
  currentLocation: null,
  
  // 端末の現在の方位角 (真北=0, 東=90, 南=180, 西=270)
  deviceHeading: 0,
  
  // コールバック
  onUpdateCallback: null,

  /**
   * ARの初期化
   * @param {HTMLVideoElement} videoEl カメラ映像を表示するvideo要素
   * @param {Function} onUpdate フレームごとの更新通知コールバック
   */
  init(videoEl, onUpdate = null) {
    this.videoElement = videoEl;
    this.onUpdateCallback = onUpdate;
  },

  /**
   * 目的地を設定
   * @param {Object} destination 涼み場所オブジェクト { id, name, latitude, longitude }
   * @param {Object} currentLocation { latitude, longitude }
   */
  setDestination(destination, currentLocation) {
    this.currentDestination = destination;
    this.currentLocation = currentLocation;
    this.updateARState();
  },

  /**
   * 現在地を更新
   * @param {Object} location { latitude, longitude }
   */
  updateLocation(location) {
    this.currentLocation = location;
    this.updateARState();
  },

  /**
   * ARセッションの開始 (カメラ起動 & 端末向きセンサ開始)
   * ※ ユーザーのタップイベント内から呼び出すこと (iOS Safari 対策)
   * @returns {Promise<{ camera: boolean, orientation: boolean }>}
   */
  async startAR() {
    let cameraSuccess = false;
    let orientationSuccess = false;

    // 1. 端末の向きセンサのパーミッション要求 & リスナー登録
    orientationSuccess = await this.startOrientationTracking();

    // 2. カメラストリームの開始
    try {
      cameraSuccess = await this.startCamera();
    } catch (e) {
      console.warn("カメラの起動をスキップまたは失敗:", e);
      cameraSuccess = false;
    }

    return {
      camera: cameraSuccess,
      orientation: orientationSuccess
    };
  },

  /**
   * カメラの開始 (背面カメラ environment)
   */
  async startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("カメラAPI非対応ブラウザです。");
    }

    // 既存ストリームがあれば停止
    this.stopCamera();

    const constraints = {
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        this.videoElement.setAttribute('playsinline', 'true'); // iOS Safari対策
        await this.videoElement.play();
      }
      this.isCameraActive = true;
      return true;
    } catch (err) {
      this.isCameraActive = false;
      throw err;
    }
  },

  /**
   * カメラの停止
   */
  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.isCameraActive = false;
  },

  /**
   * 端末の向き (DeviceOrientation) のトラッキング開始
   * iOS 13+ Safariの DeviceOrientationEvent.requestPermission に対応
   */
  async startOrientationTracking() {
    // iOS Safari 13+ の許可要求
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission === 'granted') {
          this.orientationPermissionGranted = true;
        } else {
          this.orientationPermissionGranted = false;
          console.warn("DeviceOrientationの許可が得られませんでした:", permission);
          return false;
        }
      } catch (err) {
        console.warn("DeviceOrientation requestPermissionエラー:", err);
        return false;
      }
    } else {
      // Android / PC / その他ブラウザ
      this.orientationPermissionGranted = true;
    }

    // イベントリスナーの登録
    this.handleOrientation = this.handleOrientation.bind(this);
    window.addEventListener('deviceorientation', this.handleOrientation, true);
    
    // 一部のAndroid向け absolute イベント
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', this.handleOrientation, true);
    }

    this.isOrientationActive = true;
    return true;
  },

  /**
   * 端末向きイベントハンドラ
   */
  handleOrientation(event) {
    let heading = null;

    // iOS Safari: webkitCompassHeading (0=北, 90=東, 180=南, 270=西)
    if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
      heading = event.webkitCompassHeading;
    } else if (event.alpha !== null && event.alpha !== undefined) {
      // Android / Chrome: alpha (反時計回り)
      // absolute が true の場合は 360 - alpha で近似コンパス角を計算
      heading = (360 - event.alpha) % 360;
    }

    if (heading !== null) {
      this.deviceHeading = heading;
      this.updateARState();
    }
  },

  /**
   * 向きトラッキングの停止
   */
  stopOrientationTracking() {
    if (this.handleOrientation) {
      window.removeEventListener('deviceorientation', this.handleOrientation, true);
      window.removeEventListener('deviceorientationabsolute', this.handleOrientation, true);
    }
    this.isOrientationActive = false;
  },

  /**
   * ARセッション全体の停止
   */
  stopAR() {
    this.stopCamera();
    this.stopOrientationTracking();
  },

  /**
   * ARの計算状態を更新し、コールバックへ通知
   */
  updateARState() {
    if (!this.currentDestination || !this.currentLocation) {
      return;
    }

    // 1. 目的地までの距離
    const distance = calculateDistance(
      this.currentLocation.latitude,
      this.currentLocation.longitude,
      this.currentDestination.latitude,
      this.currentDestination.longitude
    );

    // 2. 目的地の真方位 (Bearing: 0〜360度)
    const bearing = calculateBearing(
      this.currentLocation.latitude,
      this.currentLocation.longitude,
      this.currentDestination.latitude,
      this.currentDestination.longitude
    );

    // 3. 端末の向き (deviceHeading) と目的地方向 (bearing) の相対角度差分 (-180〜+180度)
    // 0 = 端末の正面に目的地がある
    // 正 = 目的地は端末の右側
    // 負 = 目的地は端末の左側
    let relativeAngle = (bearing - this.deviceHeading + 360) % 360;
    if (relativeAngle > 180) {
      relativeAngle -= 360;
    }

    // 4. 方向ガイドメッセージとアイコンの決定
    let directionText = "目的地は正面";
    let directionArrow = "↑";
    let isStraight = false;

    if (Math.abs(relativeAngle) <= 20) {
      directionText = "目的地は正面です";
      directionArrow = "↑";
      isStraight = true;
    } else if (relativeAngle > 20 && relativeAngle <= 70) {
      directionText = "右ななめ前";
      directionArrow = "↗";
    } else if (relativeAngle > 70 && relativeAngle <= 120) {
      directionText = "目的地は右です";
      directionArrow = "→";
    } else if (relativeAngle > 120 && relativeAngle <= 160) {
      directionText = "右うしろ";
      directionArrow = "↘";
    } else if (relativeAngle < -20 && relativeAngle >= -70) {
      directionText = "左ななめ前";
      directionArrow = "↖";
    } else if (relativeAngle < -70 && relativeAngle >= -120) {
      directionText = "目的地は左です";
      directionArrow = "←";
    } else if (relativeAngle < -120 && relativeAngle >= -160) {
      directionText = "左うしろ";
      directionArrow = "↙";
    } else {
      directionText = "うしろを向いてください";
      directionArrow = "↓";
    }

    // 水平位置オフセット (画面上の左右位置: -50%〜+50% 範囲)
    // 視野角約60度を想定
    const horizontalFov = 60;
    let screenOffsetPercent = (relativeAngle / (horizontalFov / 2)) * 50;
    screenOffsetPercent = Math.max(-45, Math.min(45, screenOffsetPercent));

    const state = {
      destination: this.currentDestination,
      distance,
      formattedDistance: formatDistance(distance),
      walkingMinutes: calculateWalkingMinutes(distance),
      bearing,
      heading: this.deviceHeading,
      relativeAngle,
      directionText,
      directionArrow,
      isStraight,
      screenOffsetPercent,
      isCameraActive: this.isCameraActive,
      isOrientationActive: this.isOrientationActive
    };

    if (this.onUpdateCallback) {
      this.onUpdateCallback(state);
    }

    return state;
  }
};
