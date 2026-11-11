/**
 * routing.js - OSRM (Open Source Routing Machine) 歩行者道路ルーティング
 * 
 * 実際のオープン道路ネットワーク (OpenStreetMap) を利用して、
 * 現在地から涼み場所までの「道路に沿った歩行者ルート」を取得・解析します。
 * 
 * 機能:
 * - 道路網に沿った正確な移動経路座標 (GeoJSON coordinates)
 * - ターンバイターン案内 (右折・左折・直進・交差点距離)
 * - 通り名 (Street names)
 * - 総距離・徒歩所要時間
 * - APIオフライン・エラー時の直線ルート安全フォールバック
 */

const RoutingManager = {
  currentRoute: null,
  activeStepIndex: 0,

  /**
   * 2地点間の歩行者ルートをOSRMオープンAPIから取得
   * @param {number} startLat 現在地緯度
   * @param {number} startLon 現在地経度
   * @param {number} endLat 目的地緯度
   * @param {number} endLon 目的地経度
   * @returns {Promise<Object>} ルート情報
   */
  async getWalkingRoute(startLat, startLon, endLat, endLon) {
    // OSRM 公開歩行者ルーティングAPI (無料・APIキー不要)
    const url = `https://router.project-osrm.org/route/v1/foot/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=geojson&steps=true`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!response.ok) {
        throw new Error(`Routing API HTTP Error: ${response.status}`);
      }
      const data = await response.json();

      if (!data.routes || data.routes.length === 0) {
        throw new Error("有効な歩行者ルートが見つかりませんでした。");
      }

      const routeData = data.routes[0];
      const coordinates = routeData.geometry.coordinates.map(coord => [coord[1], coord[0]]); // [lat, lon] へ変換
      const rawSteps = (routeData.legs && routeData.legs[0] && routeData.legs[0].steps) || [];

      // ステップバイステップの指示を分かりやすい日本語に整形
      const steps = this.parseSteps(rawSteps, endLat, endLon);

      this.currentRoute = {
        distance: routeData.distance, // メートル
        duration: routeData.duration, // 秒
        walkingMinutes: Math.max(1, Math.ceil(routeData.distance / 80)),
        coordinates,
        steps,
        isRoadNetwork: true
      };
      this.activeStepIndex = 0;

      return this.currentRoute;
    } catch (err) {
      console.warn("OSRM歩行者ルーティング失敗。直線フォールバックを使用します:", err.message);
      return this.generateFallbackRoute(startLat, startLon, endLat, endLon);
    }
  },

  /**
   * OSRMのステップ指示を日本語ナビゲーション形式にパース
   */
  parseSteps(rawSteps, targetLat, targetLon) {
    if (!rawSteps || rawSteps.length === 0) {
      return [{
        instruction: "目的地へ向かって進んでください",
        modifier: "straight",
        actionIcon: "↑",
        distance: 0,
        formattedDistance: "0m",
        streetName: "目的地方向",
        location: [targetLat, targetLon]
      }];
    }

    return rawSteps.map((step, idx) => {
      const maneuver = step.maneuver || {};
      const type = maneuver.type; // 'depart', 'turn', 'new name', 'arrive' など
      const modifier = maneuver.modifier || 'straight'; // 'right', 'left', 'slight right', etc.
      const streetName = step.name ? step.name : (idx === rawSteps.length - 1 ? "目的地" : "道なり");
      const distance = Math.round(step.distance || 0);

      let actionIcon = "↑";
      let instruction = "";

      if (type === 'arrive') {
        actionIcon = "🏁";
        instruction = "目的地に到着します";
      } else if (type === 'depart') {
        actionIcon = "🚶‍♂️";
        instruction = `${streetName}を出発します`;
      } else if (modifier.includes('right')) {
        actionIcon = modifier.includes('slight') ? "↗" : "↱";
        instruction = `${distance}m先、${streetName}を右折`;
      } else if (modifier.includes('left')) {
        actionIcon = modifier.includes('slight') ? "↖" : "↰";
        instruction = `${distance}m先、${streetName}を左折`;
      } else if (modifier === 'uturn') {
        actionIcon = "↷";
        instruction = `${distance}m先、Uターン`;
      } else {
        actionIcon = "↑";
        instruction = `${distance}m先、${streetName}を直進`;
      }

      return {
        stepIndex: idx,
        instruction,
        type,
        modifier,
        actionIcon,
        distance,
        formattedDistance: formatDistance(distance),
        streetName,
        location: [maneuver.location[1], maneuver.location[0]] // [lat, lon]
      };
    });
  },

  /**
   * 現在地に基づいて次の案内ステップ（Next Waypoint）を更新
   * @param {Object} currentLocation { latitude, longitude }
   * @returns {Object} 現在のステップ案内情報
   */
  updateCurrentStep(currentLocation) {
    if (!this.currentRoute || !this.currentRoute.steps || this.currentRoute.steps.length === 0) {
      return null;
    }

    // 次のステップの目標地点までの距離を測定
    const currentStep = this.currentRoute.steps[this.activeStepIndex];
    if (!currentStep) return null;

    const distToStep = calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      currentStep.location[0],
      currentStep.location[1]
    );

    // ウェイポイントの15m以内に近づいたら次のステップへ自動移行
    if (distToStep < 15 && this.activeStepIndex < this.currentRoute.steps.length - 1) {
      this.activeStepIndex++;
    }

    const nextStep = this.currentRoute.steps[this.activeStepIndex];
    const distToNext = calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      nextStep.location[0],
      nextStep.location[1]
    );

    return {
      stepIndex: this.activeStepIndex,
      totalSteps: this.currentRoute.steps.length,
      currentStep: nextStep,
      distanceToNextStep: distToNext,
      formattedDistanceToNextStep: formatDistance(distToNext),
      totalRouteDistance: this.currentRoute.distance,
      walkingMinutes: this.currentRoute.walkingMinutes,
      isArrival: this.activeStepIndex >= this.currentRoute.steps.length - 1
    };
  },

  /**
   * API利用不能時の直線フォールバックルート生成
   */
  generateFallbackRoute(startLat, startLon, endLat, endLon) {
    const dist = calculateDistance(startLat, startLon, endLat, endLon);
    this.currentRoute = {
      distance: dist,
      duration: dist / 1.33,
      walkingMinutes: Math.max(1, Math.ceil(dist / 80)),
      coordinates: [
        [startLat, startLon],
        [endLat, endLon]
      ],
      steps: [
        {
          stepIndex: 0,
          instruction: "涼み場所へ向かって進んでください",
          type: "depart",
          modifier: "straight",
          actionIcon: "↑",
          distance: dist,
          formattedDistance: formatDistance(dist),
          streetName: "目的地への直線路",
          location: [endLat, endLon]
        },
        {
          stepIndex: 1,
          instruction: "目的地に到着します",
          type: "arrive",
          modifier: "straight",
          actionIcon: "🏁",
          distance: 0,
          formattedDistance: "0m",
          streetName: "目的地",
          location: [endLat, endLon]
        }
      ],
      isRoadNetwork: false
    };
    this.activeStepIndex = 0;
    return this.currentRoute;
  }
};
