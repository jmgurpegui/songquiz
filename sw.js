/**
 * @fileoverview Service Worker para SongQuiz (PWA Offline First).
 * Proporciona almacenamiento en caché local para funcionamiento sin conexión y baja latencia.
 */

const CACHE_NAME = 'songquiz-v2.0.0';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './src/styles/variables.css',
  './src/styles/main.css',
  './src/data/songs.json',
  './src/utils/random.js',
  './src/audio/soundFX.js',
  './src/audio/audioEngine.js',
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
  // Ignorar peticiones no HTTP/HTTPS o esquemas chrome-extension
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Almacenar en caché dinámico si es válida
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
