const CACHE_NAME = 'poker-decision-lab-auto-progress-v13';
const APP_SHELL = [
  './',
  './index.html',
  './sequence-app.css?v=11',
  './table-clarity.css?v=11',
  './player-actions-v10.css?v=11',
  './action-clarity-v13.css?v=13',
  './sequence-utils.js?v=11',
  './sequence-hands-1.js?v=11',
  './sequence-hands-2.js?v=11',
  './sequence-hands-3.js?v=11',
  './sequence-app-safe-v11.js?v=11',
  './player-actions-v10.js?v=11',
  './progress-fix-v13.js?v=13',
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request, {cache:'no-store'})
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
  );
});
