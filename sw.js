const CACHE_NAME = 'movie-db-shell-v3';
const APP_SHELL = [
  './',
  './index.html',
  './main.css?v=20261007rec2',
  './fetchscript.js?v=20261007rec2',
  './state.js?v=20261007pwa',
  './tmdb.js?v=20261007rec2',
  './tmdb-config.js',
  './library.js?v=20261007pwa',
  './img/noposter.jpg',
  './assets/bracket.png',
  './assets/hero.jpg',
  './assets/pwa-icon-192.png',
  './assets/pwa-icon-512.png',
  './assets/tmdb-logo.svg',
  './assets/icons/arrow-left.svg',
  './assets/icons/arrow-right.svg',
  './assets/icons/magnifying-glass.svg',
  './assets/icons/moon.svg',
  './assets/icons/sliders-horizontal.svg',
  './assets/icons/star-fill.svg',
  './assets/icons/sun.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (_) {
    return (await cache.match(request)) || (await cache.match('./index.html'));
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(event.request.mode === 'navigate' ? networkFirst(event.request) : cacheFirst(event.request));
});
