/**
 * ar.js - 高性能道路沿いARナビゲーション (Turn-by-Turn AR Navigation)
 * 
 * 進化した機能:
 * 1. 道路網に沿ったターンバイターンAR案内
 *    - 単なる目的地の直線ではなく、「次の曲がり角（交差点）」の方角と距離を正確に案内
 *    - 「80m先を右折」「道なりに直進」などのナビゲーション指示と連動したダイナミック矢印
 * 2. カメラ映像空間に重なる 3D AR Floating Pin (空間浮遊ピン)
 *    - 端末の向き(Heading)と傾き(Pitch/Beta)から、実際の街並み・空間上の方向にマーカーを描画
 * 3. 曲がり角への自動到達判定とステップ自動更新 (Auto-advancement)
 * 4. 2Dレーダー/コンパスへの自動フォールバックと手動切り替え
 * 5. iPhone Safari の DeviceOrientationEvent.requestPermission 完全対応
 */

const ARManager = {
  videoElement: null,
  stream: null,
  isCameraActive: false,
  isOrientationActive: false,
  orientationPermissionGranted: false,

  // ナビゲーション対象
  currentDestination: null,
  currentLocation: null,
  currentRoute: null, // RoutingManager からの道路ルート
  navMode: 'road', // 'road' (道路沿い案内) | 'direct' (目的地直線案内)

  // 端末姿勢センサ
  deviceHeading: 0, // 水平方位角 (0〜360度)
  devicePitch: 0,   // 傾き・仰角 (前後傾き beta)
  deviceRoll: 0,    // 左右傾き (gamma)

  // 更新コールバック
  onUpdateCallback: null,

  /**
   * 初期化
   */
  init(videoEl, onUpdate = null) {
    this.videoElement = videoEl;
    this.onUpdateCallback = onUpdate;
  },

  /**
   * ナビゲーション設定 (目的地 & 道路ルート)
   */
  setNavigation(destination, currentLocation, route = null) {
    this.currentDestination = destination;
    this.currentLocation = currentLocation;
    this.currentRoute = route;
    this.updateARState();
  },

  /**
   * 現在地更新
   */
  updateLocation(location) {
    this.currentLocation = location;
    if (this.currentRoute && this.navMode === 'road') {
      RoutingManager.updateCurrentStep(location);
    }
    this.updateARState();
  },

  /**
   * ARセッション開始
   */
  async startAR() {
    let cameraSuccess = false;
    let orientationSuccess = false;

    orientationSuccess = await this.startOrientationTracking();

    try {
      cameraSuccess = await this.startCamera();
    } catch (e) {
      console.warn("カメラ起動スキップ/失敗:", e);
      cameraSuccess = false;
    }

    return { camera: cameraSuccess, orientation: orientationSuccess };
  },

  /**
   * 背面カメラの起動
   */
  async startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("カメラAPI非対応です。");
    }

    this.stopCamera();

    const constraints = {
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (this.videoElement) {
      this.videoElement.srcObject = this.stream;
      this.videoElement.setAttribute('playsinline', 'true');
      await this.videoElement.play();
    }
    this.isCameraActive = true;
    return true;
  },

  /**
   * カメラ停止
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
   * 端末姿勢センサ (DeviceOrientation) 開始
   */
  async startOrientationTracking() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission === 'granted') {
          this.orientationPermissionGranted = true;
        } else {
          return false;
        }
      } catch (err) {
        return false;
      }
    } else {
      this.orientationPermissionGranted = true;
    }

    this.handleOrientation = this.handleOrientation.bind(this);
    window.addEventListener('deviceorientation', this.handleOrientation, true);
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', this.handleOrientation, true);
    }

    this.isOrientationActive = true;
    return true;
  },

  /**
   * センサイベントハンドラ
   */
  handleOrientation(event) {
    let heading = null;

    if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
      heading = event.webkitCompassHeading;
    } else if (event.alpha !== null && event.alpha !== undefined) {
      heading = (360 - event.alpha) % 360;
    }

    if (heading !== null) {
      this.deviceHeading = heading;
      this.devicePitch = event.beta || 0;
      this.deviceRoll = event.gamma || 0;
      this.updateARState();
    }
  },

  stopOrientationTracking() {
    if (this.handleOrientation) {
      window.removeEventListener('deviceorientation', this.handleOrientation, true);
      window.removeEventListener('deviceorientationabsolute', this.handleOrientation, true);
    }
    this.isOrientationActive = false;
  },

  stopAR() {
    this.stopCamera();
    this.stopOrientationTracking();
  },

  /**
   * 道路ナビモードと直線ナビモードの切り替え
   */
  toggleNavMode() {
    this.navMode = (this.navMode === 'road') ? 'direct' : 'road';
    this.updateARState();
    return this.navMode;
  },

  /**
   * ARの計算状態を更新
   */
  updateARState() {
    if (!this.currentDestination || !this.currentLocation) {
      return;
    }

    // 1. 最終目的地までの全体距離と方位
    const finalDistance = calculateDistance(
      this.currentLocation.latitude,
      this.currentLocation.longitude,
      this.currentDestination.latitude,
      this.currentDestination.longitude
    );
    const finalBearing = calculateBearing(
      this.currentLocation.latitude,
      this.currentLocation.longitude,
      this.currentDestination.latitude,
      this.currentDestination.longitude
    );

    // 2. ターゲット地点の決定 (道路沿いの次の曲がり角か、最終目的地か)
    let targetLat = this.currentDestination.latitude;
    let targetLon = this.currentDestination.longitude;
    let targetDistance = finalDistance;
    let targetBearing = finalBearing;
    let currentStepInfo = null;
    let turnAction = "straight"; // 'straight', 'right', 'left', 'arrive'
    let turnIcon = "↑";
    let stepInstruction = "目的地へ向かって進んでください";

    if (this.navMode === 'road' && this.currentRoute && this.currentRoute.steps) {
      const stepState = RoutingManager.updateCurrentStep(this.currentLocation);
      if (stepState && stepState.currentStep) {
        currentStepInfo = stepState;
        const step = stepState.currentStep;
        targetLat = step.location[0];
        targetLon = step.location[1];
        targetDistance = stepState.distanceToNextStep;
        targetBearing = calculateBearing(
          this.currentLocation.latitude,
          this.currentLocation.longitude,
          targetLat,
          targetLon
        );
        stepInstruction = step.instruction;
        turnIcon = step.actionIcon;
        turnAction = step.modifier;
      }
    }

    // 3. 端末Headingとの相対角度差分 (-180〜+180度)
    let relativeAngle = (targetBearing - this.deviceHeading + 360) % 360;
    if (relativeAngle > 180) relativeAngle -= 360;

    // 4. 方向ガイドメッセージの生成
    let directionText = "正面に進む";
    let isStraight = false;

    if (Math.abs(relativeAngle) <= 18) {
      directionText = "この方向へ直進";
      isStraight = true;
    } else if (relativeAngle > 18 && relativeAngle <= 65) {
      directionText = "ななめ右方向";
    } else if (relativeAngle > 65 && relativeAngle <= 115) {
      directionText = "右を向いてください";
    } else if (relativeAngle > 115 && relativeAngle <= 160) {
      directionText = "右うしろ方向";
    } else if (relativeAngle < -18 && relativeAngle >= -65) {
      directionText = "ななめ左方向";
    } else if (relativeAngle < -65 && relativeAngle >= -115) {
      directionText = "左を向いてください";
    } else if (relativeAngle < -115 && relativeAngle >= -160) {
      directionText = "左うしろ方向";
    } else {
      directionText = "後ろを向いてください";
    }

    // 5. 3D空間浮遊ピンのスクリーン投影座標計算 (FOV 60度基準)
    const horizontalFov = 65;
    let screenXPercent = (relativeAngle / (horizontalFov / 2)) * 50; // -50% 〜 +50%
    const isVisibleInScreen = Math.abs(relativeAngle) < (horizontalFov / 2);

    // 端末の上下傾き (Pitch: 0度=水平, 90度=垂直持ち)
    // 垂直に持った状態(約70〜90度)を基準に上下位置をオフセット
    const targetPitch = 75;
    const pitchDiff = (this.devicePitch - targetPitch);
    let screenYPercent = Math.max(-40, Math.min(40, pitchDiff * 0.8));

    const state = {
      destination: this.currentDestination,
      navMode: this.navMode,
      targetDistance,
      formattedTargetDistance: formatDistance(targetDistance),
      finalDistance,
      formattedFinalDistance: formatDistance(finalDistance),
      walkingMinutes: calculateWalkingMinutes(finalDistance),
      targetBearing,
      finalBearing,
      heading: this.deviceHeading,
      pitch: this.devicePitch,
      relativeAngle,
      directionText,
      turnIcon,
      turnAction,
      stepInstruction,
      currentStepInfo,
      isStraight,
      screenXPercent,
      screenYPercent,
      isVisibleInScreen,
      isCameraActive: this.isCameraActive,
      isOrientationActive: this.isOrientationActive
    };

    if (this.onUpdateCallback) {
      this.onUpdateCallback(state);
    }

    return state;
  }
};
