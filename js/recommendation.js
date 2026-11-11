/**
 * recommendation.js - 距離計算・クーリングシェルター総合評価ロジック
 * 
 * 指定暑熱避難施設（クーリングシェルター）の評価要素:
 * - 距離: 近ければ近いほど体力を奪われずに避難可能 (最大35点)
 * - 冷房 (airConditioner): 避難施設の最必須要件 (最大25点)
 * - クーリングシェルター公的指定 (coolingShelter): 自治体指定の信頼性 (最大10点)
 * - 休憩用座席 (seat): 確実に座って体を休められるか (最大10点)
 * - 冷水機・給水スポット (waterDispenser): 脱水症状を防ぐ水分補給 (最大5点)
 * - 屋内直射日光遮断 (indoor): 日陰と遮熱性 (最大5点)
 * - トイレ設備 (toilet): 体調管理 (最大5点)
 * - 混雑度 (crowdLevel): 空いている施設ほど受入余力あり (最大5点)
 */

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateWalkingMinutes(distanceMeters) {
  if (!distanceMeters || distanceMeters <= 0) return 1;
  return Math.max(1, Math.ceil(distanceMeters / 80));
}

function formatDistance(distanceMeters) {
  if (distanceMeters === null || distanceMeters === undefined || isNaN(distanceMeters)) {
    return "-- m";
  }
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)}m`;
  }
  return `${(distanceMeters / 1000).toFixed(1)}km`;
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  const bearingRad = Math.atan2(y, x);
  return (bearingRad * 180 / Math.PI + 360) % 360;
}

/**
 * クーリングシェルター総合おすすめスコアを計算
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
      score += 35;
      reasons.push("すぐ近く");
    } else if (distance <= 300) {
      score += 30;
      reasons.push("歩いてすぐ");
    } else if (distance <= 600) {
      score += 24;
    } else if (distance <= 1000) {
      score += 15;
    } else if (distance <= 1500) {
      score += 8;
    } else {
      score += 2;
    }
  } else {
    score += 20;
  }

  // 2. 冷房設備 (最大25点)
  if (place.airConditioner) {
    score += 25;
    tags.push("❄️ 冷房完備");
  }

  // 3. クーリングシェルター公的指定 (最大10点)
  if (place.coolingShelter) {
    score += 10;
    tags.push("🏛️ 指定避難施設");
    reasons.push("指定暑熱避難施設");
  }

  // 4. 休憩座席 (最大10点)
  if (place.seat) {
    score += 10;
    tags.push("🪑 座席あり");
  }

  // 5. 冷水機・給水スポット (最大5点)
  if (place.waterDispenser) {
    score += 5;
    tags.push("💧 給水可能");
  }

  // 6. 屋内施設 (最大5点)
  if (place.indoor) {
    score += 5;
    tags.push("🏢 屋内日陰");
  }

  // 7. トイレ完備 (最大5点)
  if (place.toilet) {
    score += 5;
    tags.push("🚻 トイレあり");
  }

  // 8. 混雑度 (最大5点)
  if (place.crowdLevel === 'low') {
    score += 5;
    tags.push("🟢 空いていそう");
    reasons.push("ゆったり休める");
  } else if (place.crowdLevel === 'medium') {
    score += 3;
    tags.push("🟡 適度な混雑");
  } else if (place.crowdLevel === 'high') {
    tags.push("🔴 混雑気味");
  }

  score = Math.min(100, Math.max(0, Math.round(score)));

  let rank = "通常";
  let badgeClass = "badge-normal";

  if (score >= 85) {
    rank = "今すぐおすすめ避難先";
    badgeClass = "badge-super";
  } else if (score >= 70) {
    rank = "快適に休めるシェルター";
    badgeClass = "badge-high";
  } else if (score >= 50) {
    rank = "休憩可能スポット";
    badgeClass = "badge-mid";
  }

  return {
    score,
    rank,
    badgeClass,
    tags,
    distance,
    walkingMinutes: calculateWalkingMinutes(distance),
    formattedDistance: formatDistance(distance),
    primaryReason: reasons.length > 0 ? reasons.join('・') : "暑熱避難所"
  };
}
