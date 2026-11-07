/* تقويمي — Service Worker
   استراتيجية: pre-cache للهيكل، ثم cache-first مع تحديث في الخلفية. */

const VERSION = 'taqwimi-v33';
const ASSET_V = '36';
const CORE = [
  './',
  './index.html',
  './assets/og-image.png',
  './assets/important-links/official-site.png',
  './assets/important-links/official-site-mobile.png',
  './assets/important-links/official-app.jpg',
  './assets/important-links/guide-cover.png',
  './assets/important-links/program-cover.png',
  './assets/important-links/venue.jpg',
  `./assets/styles.css?v=${ASSET_V}`,
  `./assets/app.js?v=${ASSET_V}`,
  './data/program.v3.js',
  './data/program.json',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/committee-logo-320.png',
  './icons/noon-logo.png',
  './icons/conference-logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      Promise.all(
        CORE.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  /* Navigations: network-first so a new deployment appears on the next visit
     while still working offline from the cache. */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
