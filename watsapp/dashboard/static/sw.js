const CACHE_NAME = 'argus-v2';
const PRECACHE = [
  '/static/css/dashboard.css',
  '/static/js/dashboard.js',
  '/static/manifest.json',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network-first for all HTML/API, cache-fallback for static assets only
  if (e.request.url.includes('/static/')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  } else {
    e.respondWith(fetch(e.request));
  }
});
