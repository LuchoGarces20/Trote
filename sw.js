const CACHE_NAME = 'trote-pwa-v5'; // Versão atualizada para forçar a renovação do cache

// Recursos essenciais para cache offline (substituído ./app.js pelos novos scripts modularizados)
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/utils.js',
  './js/coach-physiology.js',
  './js/coach-planner.js',
  './js/coach-state.js',
  './js/ui-render.js',
  './js/ui-events.js',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/Trote-logo.svg',
  './img/Trote-logo-light.svg',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700;800;900&display=swap',
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@700;800;900&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Instalação do Service Worker e precache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Ativação e limpeza de caches antigos
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

// Estratégia Stale-While-Revalidate: responde do cache e atualiza no fundo
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => {
        // Falha de rede (offline): usa o cache silenciosamente
      });
      return cachedResponse || fetchPromise;
    })
  );
});