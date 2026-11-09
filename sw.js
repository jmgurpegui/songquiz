/**
 * @fileoverview Service Worker para SongQuiz (PWA Mobile, Tablet & Chromecast).
 * Estrategia Network-First con fallback a caché para código/datos y Cache-First para audios estáticos.
 */

const CACHE_NAME = 'songquiz-v3.2.1';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './src/styles/variables.css',
  './src/styles/main.css',
  './src/data/songs.json',
  './src/data/thematicPlaylists.js',
  './src/utils/random.js',
  './src/utils/playlistParser.js',
  './src/audio/soundFX.js',
  './src/audio/audioEngine.js',
  './src/audio/youtubePlayer.js',
  './src/audio/castManager.js',
  './src/ui/visualizer.js',
  './src/core/gameState.js',
  './src/core/gameLogic.js',
  './src/ui/domRenderer.js',
  './src/main.js',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.svg',
  './assets/icons/icon-512.svg',
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
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
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
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCodeOrData = isSameOrigin && /\.(html|js|css|json)$/i.test(url.pathname) || url.pathname.endsWith('/');

  if (isCodeOrData) {
    // Network-First para garantizar que móvil, tablet y escritorio carguen siempre la última versión
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
