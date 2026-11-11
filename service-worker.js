/**
 * service-worker.js - CoolNavi オフラインキャッシュ
 * 炎天下で通信が不安定な環境でも、アプリUIとキャッシュ済みデータを即座に表示
 */

const CACHE_NAME = 'coolnavi-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/recommendation.js',
  './js/location.js',
  './js/routing.js',
  './js/places.js',
  './js/map.js',
  './js/ar.js',
  './js/app.js',
  './data/places.json',
  './data/weather.json',
  './images/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // 外部API (OSM, Open-Meteo, OSRM) はネットワークファースト
  if (event.request.url.includes('overpass-api') || 
      event.request.url.includes('open-meteo') || 
      event.request.url.includes('project-osrm') ||
      event.request.url.includes('openstreetmap.org')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // 静的アセットはキャッシュファースト
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).then((networkResponse) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      });
    }).catch(() => {
      // オフライン時のフォールバック
      if (event.request.destination === 'document') {
        return caches.match('./index.html');
      }
    })
  );
});
