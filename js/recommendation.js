/**
 * recommendation.js - 距離計算・休みやすさ評価ロジック
 * 
 * 仕様書の要件:
 * - 距離計算 (現在地と目的地の緯度経度からメートル距離を計算)
 * - 徒歩時間の計算 (分速80m基準)
 * - 「休みやすさ」の独自評価スコア算出 (calculateRecommendationScore)
 *   近さだけでなく、冷房・座席・屋内・トイレ・混雑状況などを総合評価
 * - 方位角 (Bearing) の計算 (ARやコンパス案内用)
 */

/**
 * 2地点の緯度経度から距離(メートル)を計算 (Haversine formula)
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} 距離(m)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // 地球の半径 (メートル)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 距離(m)から徒歩所要時間(分)を計算 (不動産基準: 80m/分)
 * @param {number} distanceMeters 
 * @returns {number} 徒歩分数 (最低1分)
 */
function calculateWalkingMinutes(distanceMeters) {
  if (!distanceMeters || distanceMeters <= 0) return 1;
  return Math.max(1, Math.ceil(distanceMeters / 80));
}

/**
 * 人間が直感的にわかりやすい距離表示フォーマット (例: "350m", "1.2km")
 * @param {number} distanceMeters 
 * @returns {string} フォーマット済み文字列
 */
function formatDistance(distanceMeters) {
  if (distanceMeters === null || distanceMeters === undefined || isNaN(distanceMeters)) {
    return "-- m";
  }
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)}m`;
  }
  return `${(distanceMeters / 1000).toFixed(1)}km`;
}

/**
 * 現在地から目的地への方位角 (真北を0度として時計回りに0〜360度) を計算
 * @param {number} lat1 現在地緯度
 * @param {number} lon1 現在地経度
 * @param {number} lat2 目的地緯度
 * @param {number} lon2 目的地経度
 * @returns {number} 方位角 (0〜360度)
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  const bearingRad = Math.atan2(y, x);
  return (bearingRad * 180 / Math.PI + 360) % 360;
}

/**
 * 「休みやすさ」の総合評価スコアを計算
 * 仕様書第11項: 単純な近さだけでなく「今の自分が休みやすい場所」を評価する
 * 
 * 評価要素:
 * - 距離 (近ければ近いほど体力を消耗せず休める)
 * - 冷房 (airConditioner): 暑熱回避の最重要要素
 * - 座席 (seat): 実際に座って休息できるか
 * - 屋内 (indoor): 直射日光を完全に遮断できるか
 * - トイレ (toilet): 体調管理・水分補給後の利便性
 * - 混雑度 (crowdLevel): "low" (空いている) > "medium" > "high" (満席リスク)
 * 
 * @param {Object} place 涼み場所データ
 * @param {Object} currentLocation { latitude, longitude }
 * @returns {Object} { score: number, rank: string, stars: string, tags: string[], reason: string }
 */
function calculateRecommendationScore(place, currentLocation) {
  let score = 0;
  const tags = [];
  const reasons = [];

  // 1. 距離スコア (最大35点)
  let distance = 0;
  if (currentLocation && currentLocation.latitude && currentLocation.longitude) {
    distance = calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      place.latitude,
      place.longitude
    );

    if (distance <= 100) {
      score += 35; // 目の前
      reasons.push("すぐ近く");
    } else if (distance <= 300) {
      score += 30; // 徒歩3〜4分
      reasons.push("歩いてすぐ");
    } else if (distance <= 600) {
      score += 24; // 徒歩5〜7分
    } else if (distance <= 1000) {
      score += 15; // 徒歩10分程度
    } else if (distance <= 1500) {
      score += 8;
    } else {
      score += 2;
    }
  } else {
    // 現在地がない場合の標準点
    score += 20;
  }

  // 2. 冷房の有無 (最大25点) - 暑さ対策に必須
  if (place.airConditioner) {
    score += 25;
    tags.push("冷房あり");
  }

  // 3. 座席の有無 (最大15点) - 座って休めるか
  if (place.seat) {
    score += 15;
    tags.push("座席あり");
  }

  // 4. 屋内施設 (最大10点) - 日差しを遮断できるか
  if (place.indoor) {
    score += 10;
    tags.push("屋内");
  }

  // 5. トイレ設備 (最大5点)
  if (place.toilet) {
    score += 5;
    tags.push("トイレあり");
  }

  // 6. 混雑状況 (最大10点)
  if (place.crowdLevel === 'low') {
    score += 10;
    tags.push("空いていそう");
    reasons.push("空いていてゆったり休める");
  } else if (place.crowdLevel === 'medium') {
    score += 5;
    tags.push("適度な混雑");
  } else if (place.crowdLevel === 'high') {
    score += 0;
    tags.push("混雑気味");
    reasons.push("やや混雑中");
  }

  // スコアの正規化 (0〜100)
  score = Math.min(100, Math.max(0, Math.round(score)));

  // おすすめ度ランク判定
  let rank = "通常";
  let stars = "★★★☆☆";
  let badgeClass = "badge-normal";

  if (score >= 85) {
    rank = "最高（今すぐおすすめ）";
    stars = "★★★★★";
    badgeClass = "badge-super";
  } else if (score >= 70) {
    rank = "高（快適に休める）";
    stars = "★★★★☆";
    badgeClass = "badge-high";
  } else if (score >= 50) {
    rank = "中（休憩可能）";
    stars = "★★★☆☆";
    badgeClass = "badge-mid";
  }

  return {
    score,
    rank,
    stars,
    badgeClass,
    tags,
    distance,
    walkingMinutes: calculateWalkingMinutes(distance),
    formattedDistance: formatDistance(distance),
    primaryReason: reasons.length > 0 ? reasons.join('・') : "涼みスポット"
  };
}
