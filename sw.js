/**
 * @fileoverview Service Worker para SongQuiz (PWA / Android TWA, Mobile & Tablet).
 * Estrategia Network-First con fallback a caché para código/datos y Cache-First para audios e iconos.
 */

const CACHE_NAME = 'songquiz-v3.8.1';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './src/data/songs.json',
  './src/data/lyricsBank.json',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.svg',
  './assets/icons/icon-512.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/audio/blinding_lights.wav',
  './assets/audio/shape_of_you.wav',
  './assets/audio/bohemian_rhapsody.wav',
  './assets/audio/billie_jean.wav',
  './assets/audio/stayin_alive.wav',
  './assets/audio/take_on_me.wav'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          PRECACHE_ASSETS.map((assetUrl) =>
            fetch(assetUrl, { cache: 'no-cache' })
              .then((res) => {
                if (res && res.ok) {
                  return cache.put(assetUrl, res);
                }
                return undefined;
              })
              .catch(() => undefined)
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return undefined;
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith('http')) return;
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Navegación HTML (soporta apertura offline de la PWA/TWA incluyendo ?mode=lyrics)
  if (event.request.mode === 'navigate' && isSameOrigin) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          }
          return networkResponse;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  const isCodeOrData = isSameOrigin && (/\.(html|js|css|json)$/i.test(url.pathname) || url.pathname.endsWith('/'));

  if (isCodeOrData) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});
